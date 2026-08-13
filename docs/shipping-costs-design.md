# Domestic delivery pricing — final design for approval

*Design only. Nothing implemented, nothing edited. Every line reference is to the working tree on `feat/sanity-orderable-lists` at `e40999de`, re-verified for this document. Where a draft section and an adversarial verification disagreed, I have trusted the verification and said so. Five claims I re-checked myself against the tree and three of them change a decision — flagged in §4 and §5.*

*The file is named `shipping-costs-design.md` because that is what the brief called it. **The feature is called DELIVERY, everywhere, in every identifier and every string.** `project.delivery_suburb` already exists and cannot be renamed without a table rebuild; every customer-facing sentence on the site says delivery. Two vocabularies for one charge is how a `shipping_total` column ends up beside a `delivery_amount` column with a fortnight of argument about which one the deposit is half of.*

---

## 1. WHAT THIS IS, AND WHY

The business recovers **nothing** for domestic delivery today. Not partially — nothing. There is no zone table, no postcode column, no four-digit regex anywhere in `src/`, `worker/` or `migrations/`, and no total, client or server, with a term for freight in it. Every domestic delivery expense since this system shipped has come out of margin.

Three sums, one shape, no freight:

| Where | What it sums |
|---|---|
| `src/data/quoteSummary.ts:48` | `items.reduce((sum, it) => sum + linePriceTotal(it), 0)` — the customer's running estimate |
| `worker/lib/revisions.ts:152` | `lines.reduce((s, l) => s + (l.line_total \|\| 0), 0)` — the issued quote |
| `worker/lib/orders.ts:141` | `revLines.reduce((s, l) => s + (l.line_total \|\| 0), 0)` — the contract, the deposit, the balance |

The single existing hook is `project.delivery_suburb` (`migrations/0006_project_contact.sql:13`) — a free-text string like `"Preston VIC 3072"`, written at `worker/routes/quote.ts:199`, exposed to ops at `worker/routes/ops.ts:471`, typed at `src/ops/api.ts:113`, and **rendered nowhere**. Nothing prices, zones or geocodes off it.

This feature prices the **Australian domestic leg only** — port cartage, warehouse handling, last mile, tailgate. International freight, customs, duty and import GST are already inside the product prices.

It also fixes two things it cannot ship without. The deposit is computed in four places over two different percentages and the disagreement is currently invisible; the moment `total` means goods **plus** delivery it becomes a number on a document the customer keeps. And two customer-facing strings promise door-to-door delivery from an Australian factory, neither of which exists — charging money against that description converts a marketing inaccuracy into a paid representation.

---

## 2. LOCKED DECISIONS — owner-confirmed

Recorded at the top because this touches six subsystems and these are exactly the calls that get re-argued between them. **Do not re-litigate. Do not propose alternatives.** Anything not fixed here is an open question in §14, never a silent choice.

| # | Decision |
|---|---|
| **D1** | Manufacturing is **OVERSEAS**, built to order. There is no meaningful domestic stock. Rowville VIC, Lakemba NSW and Burswood WA are **display/appointment showrooms, not factories**. |
| **D2** | International freight, customs, duty and import GST are **already inside product prices**. This prices the domestic leg only. |
| **D3** | The fee must recover **ALL** domestic delivery expenses — port cartage, warehouse handling, last mile, tailgate — **on both fulfilment paths**. |
| **D4** | Large orders ship direct from overseas; small orders route via a warehouse. The split is **fuzzy and not computable at estimate time**. Therefore **ONE rate model, NO path branching**. Staff correct at review when the path makes it materially different. |
| **D5** | Rate model, per zone: a **minimum charge (a FLOOR, not a base)**, a **dollar-per-square-metre rate**, and a **per-zone MAXIMUM cap**. `cost = clamp(totalAreaM2 × ratePerSqm, minCharge, maxCharge)`. The floor matches `worker/lib/estimator/pricing.ts:158` — `unit = Math.max(unit, rate.minCharge)`. The cap exists because freight is **stepped, not linear** — the owner: *"2 or 10 windows would not be 2-10x more expensive to ship."* |
| **D6** | Roughly **12 zones**: metro and regional per state, plus TAS, NT and remote. |
| **D7** | The customer states a delivery **POSTCODE**. Validate four digits. Map to zone via stored postcode ranges. |
| **D8** | The postcode is **required at submit, inside the existing submit form**. No new step, no new screen, no new page — the standard e-commerce model. Delivery is deliberately **NOT** in the running estimate while the customer builds: products can be added straight from product pages so *"after the first opening"* has no reliable hook, and a higher total from the outset is a negative experience. |
| **D9** | A postcode in an unpriced, remote or unknown zone **still shows a conservative high estimate**. The owner explicitly overrode the "quote separately, show no number" recommendation. **Never show nothing.** |
| **D10** | Deposit is **50% of (goods + delivery)**. The 40% ops policy knob is **DELETED**. All disagreeing sources reconcile to one. |
| **D11** | **ISSUE GATE**: a quote cannot be issued until delivery is settled — a number must be entered, and **an explicit 0 counts as settled**. |
| **D12** | The figure is **indicative** while pending review and **fixed and honoured** once issued. If the real carrier cost lands higher after acceptance, **the business absorbs it**. No variation invoicing, and none is to be built. |
| **D13** | Account discounts apply to **product only**, never to delivery. |
| **D14** | Trade customers arranging their own freight need **no special mechanism** — staff price delivery at 0. |
| **D15** | Customer pickup is **dropped entirely**. No domestic stock, no dock. |
| **D16** | Delivery **attracts GST** and is displayed **GST-inclusive**, like everything else customer-facing. |
| **D17** | Delivery is **NOT** a `quote_line`, `revision_line` or `order_line`. It is a **project-level charge**. |
| **D18** | The delivery copy changes in the **same release**: `src/pages/ProductsPage.tsx:41` and `src/pages/HowItWorksPage.tsx:116` must reflect the real service — **tailgate to kerbside, the customer unloads**. |
| **D19** | Ops **must see the machine estimate beside the staff-confirmed number**, so rate-table drift is visible per job. The owner is guessing the initial rates; **every override is a data point**. |
| **D20** | There is **no carrier API**. The owner populates the rate table by hand and corrects it as real invoices arrive. |

### 2.1 Two consequences of D3 + D4 that nothing else states

D4 removes path branching, so one rate covers both paths. The two paths do not cost the same — the warehouse-routed one carries an extra handling leg. **The rate is therefore calibrated from the DEARER path.** The cheaper path is then over-recovered, and over-recovery is corrected downward by a human at review, in front of the number. Under-recovery is invisible until the carrier invoice arrives, which is where the business has been for the life of this system. Failure has a safe direction and this is it.

This has one concrete effect on §13: the invoices the owner supplies must be **labelled by path**, or he will calibrate against whichever ones are to hand and systematically under-recover on the other.

---

## 3. THE CORE DESIGN, IN ONE PAGE

```
CUSTOMER BUILDS          → running estimate = Σ line totals.  NO delivery.  (D8)
       │
CUSTOMER SUBMITS         → postcode required, 4 digits, in the existing form (D7, D8)
       │                   project.delivery_postcode written in the SAME batch
       │
OPS REVIEWS              → machine estimate computed LIVE on every read:
       │                     zone   = narrowest postcode range containing it
       │                     area   = Σ over PARENT lines of (w/1000 × h/1000 × qty)
       │                     cost   = round10(clamp(area × rate, min, max))
       │                   shown BESIDE an input for the staff figure         (D19)
       │
STAFF SETTLES            → project.delivery_amount := a number.  0 is a number. (D11, D14)
       │                   the machine's figure is STAMPED at that instant
       │
ISSUE GATE               → delivery_amount IS NULL  ⇒  refuse.  Button blocked,
       │                   Worker refuses independently.                       (D11)
       │
ISSUE                    → quote_revision.delivery_total := the settled figure
       │                   totals_json := { total, goods, delivery, + the basis }
       │                   INDICATIVE becomes FIXED                            (D12)
       │
ACCEPT                   → "order".delivery_total := the same figure
       │                   "order".total = Σ order_line + delivery
       │                   deposit = round(total × 50/100),  balance = total − deposit
       │                                                                       (D10)
CARRIER COSTS MORE       → the business wears it.  No second invoice.          (D12)
```

Five properties hold by construction rather than by care:

1. **Delivery cannot enter the running estimate** — it is not a line, and every builder total sums lines (§4.2).
2. **The account discount cannot reach delivery** — the freight basis is millimetres, not money, and no delivery function takes a user (§5.4).
3. **An unsettled quote cannot be issued** — the gate is a NULL test on a column with no default (§4.3).
4. **A trade waiver needs no mechanism** — `0` and `NULL` are different states (§4.3).
5. **A rate edit cannot move an issued quote** — the figure is a stored column on the revision, read back, never recomputed (§6.4).

---

## 4. THE DATA MODEL

### 4.1 What exists today

`grep -n delivery migrations/*.sql` returns exactly two things: `project.delivery_suburb` (`0006_project_contact.sql:13`) and `notification.delivery_state` (`0001_customer_core.sql:174`), an enum of `'queued','sent','failed','acked'` that has nothing to do with Australia. Everything below is new and every statement is additive.

Last applied migration is `migrations/0042_drop_pricing_change.sql`; the sequence has no gaps. **Two new migrations: `0043` and `0044`.**

### 4.2 Why delivery is a project-level charge and not a line

D17 states it. This is the evidence, because the alternative looks superficially free — `quote_line` already exists, already prices, already flows into revisions and orders — and someone will propose it again in six months.

**1. `quote_line.product_slug` is `TEXT NOT NULL`** (`migrations/0001_customer_core.sql:89`). A delivery row must name a product. A sentinel slug like `__delivery__` returns `undefined` from `getProductBySlug()`, and every reader falls through to the raw slug — `worker/routes/ops.ts:135`, `worker/lib/revisions.ts:171` (the *frozen* snapshot), `worker/routes/ops.ts:529`. The customer's issued quote prints `__delivery__` in the product column, on an immutable record. A *real* catalogue product instead puts freight into Sanity, where it appears in family listings, the configurator picker, the sitemap, and the pricing reconciler's "offered but unpriced" report.

**2. `line_kind` has no schema enforcement.** `migrations/0028_composite_lines.sql:38-41` says so in its own comment: SQLite cannot add a CHECK via `ALTER TABLE`, so the three values are validated in `worker/lib/composite.ts` and by a test. A fourth value is not one migration — it is a value every reader must be taught, and the readers are spread across `worker/lib/composite.ts:208/238/294/317/525`, `worker/routes/ops.ts:825` (composite branch of the line PATCH), `:897`, `:957` (the segment editor), `:1649/1675/1679/1749` (the thermal audit), `worker/routes/projects.ts:72/165/378`, and `worker/lib/ai/outcomes.ts:125` (the learning corpus). None would fail loudly. They would produce a thermal audit with a freight charge in it.

**3. The parents-only SUM would put delivery in the running estimate, which D8 forbids.** Every total in this system is `SUM(line_total) WHERE parent_line_id IS NULL`:

| Where | What |
|---|---|
| `src/data/quoteSummary.ts:48` | the builder's sticky bar |
| `worker/routes/projects.ts:38` | the customer dashboard |
| `worker/routes/ops.ts:324`, `:348` | the ops queue and list |
| `worker/lib/revisions.ts:152` | the issued revision |
| `worker/lib/orders.ts:141` | the contract |
| `src/ops/ProjectRecord.tsx:169` | the ops record header |

Five of those are wanted. The first is forbidden. The property that would make a delivery line "just work" for the revision total is the property that breaks the experience the owner asked for, and suppressing it means a hand-written exclusion in two more places where the next person adding a total forgets it.

**4. It would hit the submit gate from the wrong side.** `worker/routes/quote.ts:187-190` refuses submission when any line is not `ready`/`technical_review` or has a NULL `line_total`. A delivery line would have to be priced *before submit* — but the postcode that prices it is collected *at* submit (D8). The gate fires before the input exists.

**5. The account discount would eat it.** `worker/lib/estimator/pricing.ts:189-196` applies `discountPercent` inside the per-line calculation, before rounding. A delivery line priced through the engine is discounted by construction, and the fix would be a slug check in the hottest code path in the system. A project-level column is structurally out of reach — a stronger guarantee than any conditional.

**6. The snapshot tables cannot carry it.** `revision_line` (`0001:103-115`) has no `product_slug`, no `line_kind`, no `status`, and `product_snapshot_json TEXT NOT NULL`. `order_line` (`0001:136-144`) has less. Neither has ever had an `ALTER TABLE` applied in forty-two migrations.

**7. Against all that, the project-level charge costs three columns and two additions.** The line design touches six totals, ten `line_kind` readers, two gates, the pricing engine, the catalogue and an immutable snapshot format. The asymmetry is not close.

#### One invariant is retired here, deliberately

After this change:

```
quote_revision.totals_json.total  ≠  SUM(revision_line.line_total)
"order".total                     ≠  SUM(order_line.line_total)
```

by exactly the delivery charge. That is not drift. Delivery is not a line, so it is not in the line sum. **Any existing test that asserts a header total equals the sum of its lines is asserting that delivery does not exist**, and the correct fix is to delete the assertion, not to add a delivery line to satisfy it. Someone must grep `scripts/tests/api.test.mjs` for one before this ships — it is on the C8 checklist in §11.

Verified as unaffected: `learning_outbox` (`worker/lib/revisions.ts:189-194`) carries `issuedLines` only, so the AI learning corpus never sees the charge.

### 4.3 `migrations/0043_one_deposit_percent.sql`

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 0043_one_deposit_percent — one deposit percentage, and one place that says it.
--
-- The deposit is computed in FOUR places over TWO different percentages:
--   worker/lib/orders.ts:31          DEPOSIT_PERCENT = 50   (the real payment rows)
--   worker/lib/estimator/pricing.ts:252  row?.deposit_percent ?? 40  (advisory only)
--   src/pages/QuoteReviewPage.tsx:67     Math.round(total / 2)  (browser arithmetic)
--   src/pages/accountModel.tsx:129       Math.round(t / 2)      (browser arithmetic)
--
-- Today the disagreement is invisible: the two 50s agree with each other and the
-- 40 is seen by nobody outside the ops pricing preview. The moment `total` means
-- goods PLUS delivery it stops being invisible and becomes a number on a document
-- the customer keeps — the review screen quotes one deposit, the invoice asks for
-- another, and the difference is exactly the freight. There is no explanation for
-- that which does not begin with "our software".
--
-- Owner (locked decision 10): the deposit is 50% of goods + delivery, and the
-- 40% knob is DELETED — not defaulted, not left inert, deleted.
--
-- DROP COLUMN IS LEGAL HERE and this migration is not the first to use it:
-- migrations/0037_drop_measured_by.sql:12 drops a column that even carried a
-- CHECK constraint. D1 runs SQLite ≥ 3.35. `deposit_percent` is not a primary
-- key, not UNIQUE, not indexed, and not named in a table-level CHECK or partial
-- index, so the drop is a metadata change. (The "SQLite cannot drop a column"
-- claim in migrations/0033 predates 0037 and was never corrected.)
--
-- DEPLOY ORDER — 0037 states the rule and this migration obeys it:
-- ship the code that no longer reads deposit_percent FIRST, THEN apply this.
-- Append-only: never edit an applied migration.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE pricing_policy DROP COLUMN deposit_percent;
```

Code changes shipping ahead of it, in commit C1 (§11):

- `worker/lib/estimator/pricing.ts:204/248-253` — `PriceSnapshot.depositAmount` is computed from `DEPOSIT_PERCENT` imported from `worker/lib/orders.ts:31`. The `?? 40` fallback goes.
- `worker/routes/ops-pricing.ts:479` — `depositPercent` leaves the `GET /policy` payload. **`worker/routes/ops-pricing.ts:487-511` (`PUT /policy`) is deleted outright.** `GET /policy` survives as the read of `version` and `gst_mode`.
- `src/ops/Pricing.tsx:911-968` — the deposit editor goes; `opsSavePolicy` (`src/ops/api.ts:422-423`) goes with it.
- The revision DTO gains `deposit` and `balance`, produced by the same expression that writes `payment.amount` (`worker/lib/orders.ts:142-143`). `src/pages/QuoteReviewPage.tsx:67-68` and `src/pages/accountModel.tsx:129` **delete their arithmetic and render the server's figures**.

The hardcoded `"50%"` prose (`QuoteReviewPage.tsx:132/147/184`, `RecordDetailPage.tsx:169/297/302-304`, `HowItWorksPage.tsx:87`, and the rest) stays. It is true and will remain true. The point is that no *arithmetic* survives outside the server.

### 4.4 `migrations/0044_delivery_pricing.sql`

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 0044_delivery_pricing — the Australian domestic delivery leg, priced.
--
-- Product prices already carry international freight, customs, duty and import
-- GST (owner, locked decision 2). What no price in this database has ever
-- carried is the leg AFTER the goods land: port cartage, warehouse handling,
-- last mile, tailgate. That cost has come out of margin on every job this system
-- has quoted, because there was nowhere to put it.
--
-- ONE RATE MODEL, NO PATH BRANCHING (decision 4). Large orders ship direct from
-- overseas and small orders route via a warehouse, and which one a given job
-- takes is not knowable at the moment the customer presses submit. So there is
-- no `fulfilment_path` column here and there is not going to be one: a branch
-- nobody can evaluate is a branch that gets guessed, and a guessed branch is a
-- wrong price with a confident schema behind it.
--
-- THE CAP IS THE POINT. Freight is stepped, not linear — the owner: "2 or 10
-- windows would not be 2-10x more expensive to ship". A model with a rate and no
-- cap prices a 40-opening house like forty deliveries.
--
-- ⚠️ NO RATES ARE SEEDED. The zone ROWS and the postcode RANGES are seeded — the
--    ranges are factual, public, and stable. The three money columns are left
--    NULL, because there is no carrier API to derive them from (decision 20) and
--    a seeded guess is indistinguishable from a decision. NULL means "no human
--    has priced this zone", it resolves to the conservative fallback, and the
--    console can therefore say so. A rate nobody has ever looked at is not a
--    rate, and NULL is the only value that can admit it.
--
-- NOTHING MOVES. Every ALTER lands with a default that reproduces today's
-- arithmetic exactly: existing revisions read 0, existing orders read 0, no
-- deposit or balance is recomputed, no payment row is touched. A job quoted
-- without delivery stays quoted without delivery — decision 12 applied backwards
-- in time. That is a design goal, not luck.
--
-- Append-only: never edit an applied migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Zones ───────────────────────────────────────────────────────────────────
-- cost = round10(clamp(totalAreaM2 × rate_per_sqm, min_charge, max_charge))
--
-- min_charge is a FLOOR, not a base. It is not added to the rate; the rate has
-- to climb past it before it means anything. Same reading as the rate cards —
-- worker/lib/estimator/pricing.ts:158, `unit = Math.max(unit, rate.minCharge)` —
-- so "minimum charge" means one thing in this system and not two.
CREATE TABLE delivery_zone (
  id            TEXT PRIMARY KEY,      -- 'vic-metro' | 'remote' | 'unmapped'
  label         TEXT NOT NULL,         -- 'Melbourne metro' — what ops and the
                                       -- customer read; the id is never shown
  -- NULLABLE, and that is the whole point. NULL = the owner has not priced this
  -- zone. A zero would be a price, and "free delivery to Broome" is not a state
  -- this table should be able to represent by accident.
  min_charge    REAL,
  rate_per_sqm  REAL,
  max_charge    REAL,
  -- The row an unmapped or unpriced postcode falls to. Decision 9: never show
  -- nothing. Exactly one row carries this, enforced below.
  is_fallback   INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,   -- console ordering; geography, not id
  version       TEXT NOT NULL DEFAULT 'v1',   -- optimistic concurrency, as every
                                              -- other pricing table (0015, 0029)
  active        INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  -- A negative delivery charge is not a discount, it is a typo that pays the
  -- customer to receive their windows. Same guard as ops-pricing.ts:241.
  CHECK (min_charge   IS NULL OR min_charge   >= 0),
  CHECK (rate_per_sqm IS NULL OR rate_per_sqm >= 0),
  CHECK (max_charge   IS NULL OR max_charge   >= 0),
  -- A cap below the floor is not a price band, it is a contradiction: the clamp
  -- would return one of them and the other would sit in the console looking
  -- authoritative. Refused in the schema so the console's own validation is a
  -- courtesy rather than the only guard.
  CHECK (max_charge IS NULL OR min_charge IS NULL OR max_charge >= min_charge)
);

-- Exactly one fallback. Two is one too many — resolution would take whichever row
-- the query planner reached first, and the difference between them is money.
CREATE UNIQUE INDEX idx_delivery_zone_fallback
  ON delivery_zone(is_fallback) WHERE is_fallback = 1;

-- ── Postcode → zone ─────────────────────────────────────────────────────────
-- INTEGER columns, not TEXT: postcodes compare numerically and nothing else is
-- ever needed here. '0872' is stored as 872; the leading zero is a display
-- concern, which is why project.delivery_postcode is TEXT and these are not.
--
-- Column names are pc_from / pc_to. NOT `from` — FROM is a reserved keyword and
-- `CREATE TABLE ... (from INTEGER)` is a syntax error with no obvious cause.
--
-- RANGES MAY OVERLAP, DELIBERATELY, AND ONLY BY FULL CONTAINMENT:
--   widest    the whole state     2000–2999 → nsw-regional
--   narrower  a metro band        2000–2249 → nsw-metro
--   narrower  the ACT carve-out   2600–2618 → act
--   narrowest a single postcode   2899      → remote  (Norfolk Island)
-- Resolution takes the NARROWEST range containing the postcode, tiebroken on
-- zone_id so the answer never depends on insertion order:
--
--   SELECT z.* FROM delivery_postcode_range r
--     JOIN delivery_zone z ON z.id = r.zone_id AND z.active = 1
--    WHERE ? BETWEEN r.pc_from AND r.pc_to
--    ORDER BY (r.pc_to - r.pc_from) ASC, r.zone_id ASC
--    LIMIT 1;
--
-- Layering is what lets the seed be honest: a perfect non-overlapping partition
-- of every Australian postcode is a thing nobody in this business can author
-- correctly today, and getting it wrong leaves gaps that price silently at the
-- fallback. Broad bands are always right, carve-outs are always reachable, and a
-- new exception is ONE inserted row rather than three split ones.
--
-- PARTIAL overlap — two ranges that intersect without one containing the other —
-- has no defensible resolution rule and is refused by the write endpoint (§6.2).
-- Full containment is the mechanism; partial overlap is a mistake.
CREATE TABLE delivery_postcode_range (
  id       INTEGER PRIMARY KEY,     -- rowid; a postcode band has no natural key
  zone_id  TEXT NOT NULL REFERENCES delivery_zone(id) ON DELETE CASCADE,
  pc_from  INTEGER NOT NULL,
  pc_to    INTEGER NOT NULL,
  note     TEXT,                    -- 'Macarthur — Camden, Campbelltown, Picton'.
                                    -- The owner edits these rows years from now;
                                    -- a bare 2555–2571 tells him nothing.
  -- 0200 was the lowest postcode ever issued, 9999 the highest.
  CHECK (pc_from BETWEEN 200 AND 9999),
  CHECK (pc_to   BETWEEN 200 AND 9999),
  CHECK (pc_to >= pc_from)
);
CREATE INDEX idx_delivery_pc_range ON delivery_postcode_range(pc_from, pc_to);

-- ── The project ─────────────────────────────────────────────────────────────
-- SIX columns. The machine estimate is NOT among them — it is computed live on
-- every read from the current zone table (see §5.5 for why), and what IS stored
-- is the machine's figure at the instant a human overrode it, which is the thing
-- decision 19 actually wants.
--
-- NOTE ON NAMING: notification.delivery_state (0001:174) is an unrelated column
-- on an unrelated table meaning 'queued'/'sent'/'failed'/'acked'. Nothing here
-- is named delivery_state, and neither is renamed for the other's benefit.
--
-- A FOREIGN KEY on ADD COLUMN is legal ONLY because the implicit default is NULL
-- (same shape as project.current_revision_id, 0025:24-25). If anyone later
-- "tidies" delivery_settled_by into NOT NULL DEFAULT '...', this stops running.
ALTER TABLE project ADD COLUMN delivery_postcode    TEXT;   -- exactly 4 digits, or NULL
ALTER TABLE project ADD COLUMN delivery_amount      REAL;   -- THE GATE — see below
ALTER TABLE project ADD COLUMN delivery_note        TEXT;   -- why a human moved it
ALTER TABLE project ADD COLUMN delivery_settled_at  TEXT;
ALTER TABLE project ADD COLUMN delivery_settled_by  TEXT REFERENCES user(id);
ALTER TABLE project ADD COLUMN delivery_settle_json TEXT;   -- the machine's answer,
                                                            -- stamped at settle time

-- ⚠️ delivery_amount IS THE ISSUE GATE, AND ITS NULLABILITY IS THE MECHANISM.
--
-- Decision 11: a quote cannot be issued until delivery is settled, and an
-- explicit 0 COUNTS AS SETTLED — which is how a trade customer arranging their
-- own freight is handled (decision 14), with no extra column and no flag.
--   NULL = no human has said a number yet.
--   0    = a human said zero.
-- Every gate, every DTO and every render must test `IS NULL` / `== null`. NEVER
-- `!delivery_amount`, never `> 0`, never `?? 0`, never a truthiness check. This
-- is the single most likely defect in the whole feature and it fails expensively
-- in both directions: a trade job silently blocked from issue, or an unpriced job
-- passing the gate because someone wrote `?? 0` upstream.
--
-- Which is also why this column is NOT `NOT NULL DEFAULT 0`. A default of 0 would
-- mark every row in the table as settled the instant this migration ran, including
-- everything sitting in the review queue, and the gate would be a gate that has
-- never once been closed.

-- ── The issued quote and the contract ───────────────────────────────────────
-- NOT NULL DEFAULT 0 is right here and NULL would be wrong, for exactly the
-- reason it is right on project: by the time a quote_revision row exists the gate
-- has passed, so the number is known. There is no "unsettled" state for an issued
-- revision to be in. And every revision issued before this migration genuinely
-- carried zero delivery, so the default is not a placeholder — it is the truth
-- about those rows.
ALTER TABLE quote_revision ADD COLUMN delivery_total REAL NOT NULL DEFAULT 0;

-- Same reasoning, plus one more: worker/lib/orders.ts:141 re-derives the order
-- total by summing revision_line and NEVER reads totals_json. A charge held only
-- in that JSON blob is present on the quote the customer accepted and absent from
-- the order, the deposit and the balance. This column is what the order reads.
ALTER TABLE "order" ADD COLUMN delivery_total REAL NOT NULL DEFAULT 0;
```

Then the zone and range seed of §4.6, in the same file.

#### 4.4a The six project columns

| Column | Null | Why it exists |
|---|---|---|
| `delivery_postcode` | yes | The four digits the customer stated (D7). **TEXT, not INTEGER** — `'0872'` is a postcode and `872` is a number; the customer typed the former and ops must see it back. NULL on every project created before this migration. |
| `delivery_amount` | **yes — load-bearing** | The staff-confirmed number that is actually charged. NULL = unsettled = cannot issue. 0 = settled at zero = can issue. See the warning above. |
| `delivery_note` | yes | *"Direct-from-overseas, no warehouse leg"*, *"customer's own carrier"*, *"two-truck site access"*. Feeds nothing computed. It exists because a delta with no reason attached is unusable a month later, and the deltas are the data the owner will re-rate from. |
| `delivery_settled_at` / `_by` | yes | Who and when. Ordinary attribution; `_by` references `user(id)` like `project.internal_owner_id` (`0003:9`). |
| `delivery_settle_json` | yes | `{ "estimate": 250, "areaM2": 12.4, "zoneId": "vic-metro", "zoneVersion": "v3" }` — the machine's answer **at the instant a human disagreed with it**. This is what makes an override a data point rather than an anecdote: without the area and the zone version, a year of overrides is a scatter of numbers with no independent variable. JSON rather than four columns because it is written once, read whole, and never queried — the same reasoning as `pricing_snapshot_json` on `quote_line`. |

`project.delivery_suburb` is untouched: not parsed, not split, not backfilled from, not deprecated. It is the sentence the customer typed, and it is now shown to staff **beside** the structured postcode rather than discarded into a column nothing renders (§7).

#### 4.4b `totals_json` grows five keys

`worker/lib/revisions.ts:168` currently writes `JSON.stringify({ total })` — one key. It becomes:

```json
{ "total": 12480, "goods": 11800, "delivery": 680,
  "deliveryPostcode": "3072", "deliveryZoneId": "vic-metro", "deliveryAreaM2": 12.4 }
```

`total` stays the customer-facing contract figure and is now **goods + delivery**, because D10 sets the deposit at 50% of goods + delivery and both customer deposit surfaces read `totals_json.total`.

The last three keys freeze the **basis**. Without them, an issued job's `delivery_total` can never be checked against the area it was priced on — draft lines keep moving after issue, and `delivery_settle_json` is cleared on the next revision (§6.5). D19 and D20 both depend on being able to answer *"what was this priced from?"* six months later, and this is the only place that survives to answer it. It costs nothing: same `JSON.stringify` call, same statement.

**Every reader must treat all five new keys as optional**, in one place, once, because revisions issued before this change have only `total`:

```ts
const delivery = totals.delivery ?? 0;
const goods    = totals.goods ?? totals.total;
```

### 4.5 What happens to work already in flight

Nothing is rewritten, nothing is re-invoiced, and exactly one thing gets harder.

**Drafts** — nothing to migrate. `delivery_postcode` is NULL because the question has not been asked, and it is asked at submit. The running estimate does not change by a cent.

**Submitted, not yet issued** — `submitted`, `triage_pending`, `estimator_assigned`, `technical_review_required`, `customer_clarification_required`. **This is the breaking change, and it is the whole of it.** These projects have both delivery columns NULL, so the issue gate refuses them the day this ships. Every job in the review queue is blocked until a staffer enters a number.

The remedy is already in the payload: `project.delivery_suburb` — the free-text line the customer typed — is rendered on the ops delivery block verbatim beside the postcode field. The staffer reads the four digits out of what the customer already wrote and types them.

It is **not** parsed automatically. A regex over free text that silently produces a priced zone is precisely the confidently-wrong number D12 makes the business eat with no recourse. `"Preston VIC 3072"`, `"3072"`, `"Preston, 3072 (rear lane access)"` and `"Preston"` are all things customers have typed into that box, and the last has no postcode in it at all. Showing the string to a human costs one glance; guessing at it costs a delivery.

Size the backlog the week before the release, not the day of:

```sql
SELECT count(*) FROM project WHERE status_internal IN
  ('submitted','triage_pending','estimator_assigned',
   'technical_review_required','customer_clarification_required');
```

**Already issued, not accepted.** Untouched. `delivery_total` reads 0 and `totals_json` is byte-for-byte what it was. `issued` is not in `ISSUABLE_FROM` (`worker/lib/revisions.ts:92-95`), so no issued quote is retroactively gated.

**Issued before, accepted after.** `createOrderFromRevision` reads `delivery_total = 0` and adds nothing. Correct by construction: the customer accepted a quote with no delivery charge, and D12 says an issued figure is honoured. The freight on that job is absorbed, exactly as on every job before it.

**Accepted projects and live orders.** Untouched, permanently. No `payment` row is recalculated; `payment.kind` stays `CHECK (kind IN ('deposit','balance'))` (`0002:36`) and gains no third value. The gate only fires on `ISSUABLE_FROM` statuses, so `delivery_amount` stays NULL on these forever and nothing asks.

**Rollback is forward-only.** Dropping these columns would rebuild `project`, `quote_revision` and `"order"`. The retreat from a bad release is to stop *reading* the columns — with `delivery_amount` unread the gate opens, with `delivery_total` unread the totals revert. There is no `0045_undo` and there should not be one. The one exception is C8, spelled out in §11.

### 4.6 The seed — fifteen zone rows, no rates, corrected ranges

> ⚠️ **The postcode ranges below are factual.** Australian postcode allocation by state and territory is public and stable. **The metro/regional boundaries are commercial judgements**, marked as such and listed for the owner in §14. **No dollar value is seeded anywhere.** The three money columns are NULL on every row until the owner types into Ops → Pricing → Delivery zones.

D6 says roughly twelve zones. This lands on **fourteen priced zones plus one fallback**. The two beyond metro-and-regional-per-state plus TAS, NT and remote:

- **`act`** — Canberra is neither Sydney metro nor NSW regional on any carrier's run sheet, and folding it into either produces a visibly wrong number for a city of half a million. Collapsing it later is two `UPDATE`s, no deploy. Flagged as **Q6**.
- **`unmapped`** — not a place. It is the fallback row, reached only by *not* matching. Named `unmapped` rather than `unknown` so the console never prints a zone label that reads like a place name.

```sql
-- ── Zone rows. NO RATES. ────────────────────────────────────────────────────
-- sort_order is geography, not id — the console lists them the way a person
-- thinks about the country.
INSERT INTO delivery_zone (id, label, is_fallback, sort_order) VALUES
  ('nsw-metro',    'Sydney metro',                 0,  10),
  ('nsw-regional', 'NSW regional',                 0,  20),
  ('act',          'Canberra / ACT',               0,  30),
  ('vic-metro',    'Melbourne metro',              0,  40),
  ('vic-regional', 'Victoria regional',            0,  50),
  ('qld-metro',    'Brisbane / Gold Coast metro',  0,  60),
  ('qld-regional', 'Queensland regional',          0,  70),
  ('sa-metro',     'Adelaide metro',               0,  80),
  ('sa-regional',  'South Australia regional',     0,  90),
  ('wa-metro',     'Perth metro',                  0, 100),
  ('wa-regional',  'Western Australia regional',   0, 110),
  ('tas',          'Tasmania',                     0, 120),
  ('nt',           'Northern Territory',           0, 130),
  ('remote',       'Remote and island',            0, 140),
  -- The fallback. Decision 9: an unmapped, remote or unrecognised postcode still
  -- shows a conservative HIGH estimate. It has NO postcode ranges — it is reached
  -- by not matching, never by matching. Its three numbers are the ONE piece of
  -- owner input that BLOCKS the customer-facing release (§13).
  ('unmapped',     'Unmapped postcode',            1, 150);
```

```sql
-- ── Postcode ranges — THESE ARE FACTUAL ─────────────────────────────────────
-- Layered widest-to-narrowest; resolution takes the narrowest match. Read each
-- state block top-down: the first row is the whole state, everything after it is
-- a carve-out that beats it.

-- NSW / ACT. NSW holds 1000–2599, 2619–2899, 2921–2999; ACT holds 2600–2618 and
-- 2900–2920. The 1000–1999 band is Sydney PO boxes and large-volume receivers.
INSERT INTO delivery_postcode_range (zone_id, pc_from, pc_to, note) VALUES
  ('nsw-regional', 2000, 2999, 'NSW base layer — everything not carved out below'),
  ('nsw-metro',    1000, 1999, 'Sydney PO boxes and large-volume receivers'),
  ('nsw-metro',    2000, 2249, 'Sydney — Palm Beach to Sutherland, Parramatta, Blacktown'),
  -- CORRECTED: this ran to 2574 in an earlier draft, which reaches Tahmoor (2573)
  -- and Yerrinbool (2574) in Wingecarribee Shire — the Southern Highlands, not
  -- Sydney. Picton (2571) is the last of the named Macarthur suburbs.
  ('nsw-metro',    2556, 2571, 'Macarthur — Narellan 2567, Camden 2570, Campbelltown 2560, Picton 2571'),
  ('nsw-metro',    2740, 2770, 'Western Sydney — Penrith, St Marys, Mount Druitt'),
  ('act',          2600, 2618, 'Canberra central and north'),
  ('act',          2900, 2920, 'Canberra south — Tuggeranong, Gungahlin'),
  ('remote',       2880, 2880, 'Broken Hill and far-west NSW'),
  ('remote',       2898, 2898, 'Lord Howe Island'),
  ('remote',       2899, 2899, 'Norfolk Island');

-- VIC. 3000–3999 plus the 8000–8999 PO box block.
INSERT INTO delivery_postcode_range (zone_id, pc_from, pc_to, note) VALUES
  ('vic-regional', 3000, 3999, 'Victoria base layer'),
  ('vic-metro',    8000, 8999, 'Melbourne PO boxes'),
  -- Frankston (3199) and Caroline Springs (3023) are inside this base band; an
  -- earlier draft named them on the wrong rows, which is how a later editor
  -- "fixes" a range in the wrong direction.
  ('vic-metro',    3000, 3207, 'Melbourne CBD, inner and middle suburbs; includes Frankston 3199 and Caroline Springs 3023'),
  ('vic-metro',    3335, 3338, 'Melton, Rockbank, Diggers Rest fringe'),
  ('vic-metro',    3427, 3429, 'Bulla, Sunbury'),
  -- COMMERCIAL JUDGEMENT: this band reaches Healesville 3777 and Warburton 3799,
  -- which are an hour past Lilydale. Owner to confirm — see §14 Q5.
  ('vic-metro',    3750, 3810, 'Growth corridor — Doreen through Berwick to Pakenham'),
  ('vic-metro',    3910, 3944, 'Mornington Peninsula'),
  ('vic-metro',    3975, 3980, 'Cranbourne, Lyndhurst, Tooradin');

-- QLD. 4000–4999 plus the 9000–9999 PO box block. Note there is no regional-QLD
-- PO box block: 9000–9999 is Brisbane only, and that is correct, not an omission.
INSERT INTO delivery_postcode_range (zone_id, pc_from, pc_to, note) VALUES
  ('qld-regional', 4000, 4999, 'Queensland base layer'),
  ('qld-metro',    9000, 9999, 'Brisbane PO boxes'),
  ('qld-metro',    4000, 4207, 'Brisbane, Logan, Redland'),
  ('qld-metro',    4208, 4230, 'Gold Coast — same eastern-seaboard line haul as Brisbane'),
  ('qld-metro',    4300, 4305, 'Ipswich'),
  ('qld-metro',    4500, 4519, 'Moreton Bay — Redcliffe to Caboolture'),
  ('remote',       4825, 4830, 'Mount Isa and the Gulf country'),
  -- CORRECTED: an earlier draft swept 4871–4895 into remote. That range contains
  -- the CAIRNS NORTHERN BEACHES (4878, 4879 — Smithfield, Trinity Beach, Kewarra,
  -- Palm Cove), Port Douglas 4877, Mossman 4873, Mareeba 4880, Atherton 4883 and
  -- Malanda 4885 — suburban Cairns and the whole Atherton Tableland, priced at
  -- roughly double. The genuinely remote codes are carved individually instead,
  -- and 4890/4891 (Normanton, Karumba) are added, having been missing entirely.
  ('remote',       4874, 4874, 'Weipa'),
  ('remote',       4875, 4875, 'Thursday Island and the Torres Strait'),
  ('remote',       4876, 4876, 'Bamaga and Cape York communities'),
  ('remote',       4890, 4891, 'Normanton, Karumba'),
  ('remote',       4892, 4892, 'Croydon'),
  ('remote',       4895, 4895, 'Georgetown, Forsayth');

-- SA. 5000–5799 plus the 5800–5999 PO box block.
INSERT INTO delivery_postcode_range (zone_id, pc_from, pc_to, note) VALUES
  ('sa-regional', 5000, 5999, 'South Australia base layer'),
  ('sa-metro',    5800, 5999, 'Adelaide PO boxes'),
  ('sa-metro',    5000, 5199, 'Adelaide metro'),
  ('remote',      5720, 5799, 'Far north SA — Woomera 5720, Coober Pedy 5723, Roxby Downs 5725, Leigh Creek 5731, Oodnadatta 5734');

-- WA. 6000–6797 street, Indian Ocean Territories 6798–6799, PO boxes 6800–6999.
INSERT INTO delivery_postcode_range (zone_id, pc_from, pc_to, note) VALUES
  ('wa-regional', 6000, 6999, 'Western Australia base layer'),
  ('wa-metro',    6800, 6999, 'Perth PO boxes'),
  ('wa-metro',    6000, 6199, 'Perth metro'),
  ('remote',      6700, 6799, 'Pilbara and Kimberley; Christmas Island 6798, Cocos (Keeling) 6799');

-- TAS. 7000–7799 plus the 7800–7999 PO box block. The two Bass Strait islands
-- carry a sea leg beyond the one every Tasmanian delivery already carries.
INSERT INTO delivery_postcode_range (zone_id, pc_from, pc_to, note) VALUES
  ('tas',    7000, 7999, 'Tasmania, including the 7800–7999 PO box block'),
  ('remote', 7255, 7255, 'Flinders Island'),
  ('remote', 7256, 7256, 'King Island');

-- NT. 0800–0899 street plus 0900–0999 PO boxes. Stored without the leading zero
-- because the columns are INTEGER: '0800' is 800 here.
INSERT INTO delivery_postcode_range (zone_id, pc_from, pc_to, note) VALUES
  ('nt',     800, 999, 'Northern Territory — Darwin, Palmerston, Katherine, Tennant Creek, Alice Springs, PO boxes'),
  -- 0872 is one postcode covering hundreds of remote communities across the NT,
  -- SA and WA interiors. The single most important carve-out in this table:
  -- inside the NT band it would price as a Darwin delivery.
  ('remote', 872, 872, 'Postcode 0872 — remote communities across NT, SA and WA');
```

**What the seed deliberately does not cover**, stated so nobody assumes otherwise:

- **0200–0299** (the decommissioned ANU large-volume range, retired 2010) is unmapped. A customer entering one falls to the fallback. Correct: it is not a delivery address.
- **PO-box postcodes resolve to their capital's metro zone.** You cannot deliver a window to a post office box, and a customer entering one has given a wrong address — but D9 forbids showing nothing, so the estimate is produced at the nearest sane rate and the *address* problem is caught by a human at review. The alternative is rejecting a syntactically perfect postcode at the submit form, which teaches the customer the form is broken. Whether staff should additionally be *warned* is **Q7**.
- **Metro boundaries are commercial judgements.** Gold Coast is metro; Sunshine Coast, Geelong, Ballarat, Newcastle, Central Coast, Wollongong and Mandurah are regional. Each is one row's `zone_id` away from moving, with no deploy. Listed in **Q5**.
- **The seed lives in the migration, not `scripts/db/seed.sql`.** `seed.sql` is test fixtures (`npm run db:reset`); commercial reference data ships in migrations, the precedent being `pricing_rate_card`/`pricing_policy` (`0015:42-59`) and `composite_policy` (`0028:67`). Production needs these rows on deploy, not on a reset that never runs there.

---

## 5. THE RATE ENGINE — `worker/lib/delivery.ts`

Shaped like `worker/lib/estimator/pairing.ts`: a pure core that takes rows and numbers and returns an answer, with the D1 reads in separate exported functions. That makes every case testable against real data rather than a mock.

### 5.1 The formula, and the two orderings that matter

```ts
export const deliveryCost = (areaM2: number, zone: DeliveryZone): number =>
  round10(clamp(areaM2 * zone.ratePerSqm, zone.minCharge, zone.maxCharge));
```

**`round10` is imported from `worker/lib/estimator/pricing.ts:110`, which means that module must export it.** It is currently private. Writing a second rounding helper is the class of duplication this codebase has already paid for twice — the browser pricing engine that used to shadow the server's (`worker/lib/lines.ts:8-12`), and the `Math.round(total / 2)` deposit that still disagrees with it.

**Clamp first, round last.** Not the other way round, and the reason is arithmetic that is invisible until it bills someone:

`worker/lib/estimator/pricing.ts:200-202` rounds every unit price to the $10 grid and then multiplies by qty, so **every `quote_line.line_total` in the database is a multiple of ten**. Every goods total therefore is, and `Math.round(total / 2)` has always split evenly. Nobody in the history of this system has seen `deposit ≠ balance`.

A delivery charge that is *not* on the $10 grid produces an odd total for the first time. Then `src/pages/RecordDetailPage.tsx:297` prints `Payment · 50 / 50` above a bar with two hardcoded `width: "50%"` halves (`:299-301`) and two `PayRow`s labelled `Deposit 50%` / `Balance 50%` (`:302-304`) showing amounts a dollar apart, while `payment.percent` stores `50` on both rows. Rounding last keeps delivery on the grid, keeps every total even, and that entire class of defect never occurs.

The cost of rounding last is that a rounded figure can exceed a cap by up to $5 when the cap is not itself a multiple of ten. That is accepted, stated, and made visible: the zone editor shows the rounded worked example (`$895 → $900`) so the owner sees it at the moment he types the cap.

**`min > max`** cannot exist in D1 — `CHECK (max_charge >= min_charge)`. The pure function still needs a defined answer for a hand-constructed zone, and it returns the **lower** of the two. An unbounded charge from a typo reaches a customer; an undercharge is caught by the human gate.

**Zero area** returns `round10(minCharge)`, because that is what the locked formula says: `clamp(0, min, max) = min`. No short-circuit — adding one changes a locked formula. Note that zero-line projects *are* reachable: `worker/routes/quote.ts:169` permits submission with no lines when the AI job terminally failed and a clean file exists. That case is flagged as **Q8**, not silently special-cased.

**An unpriced zone never reaches this function.** `zoneIsPriced()` (all three money columns non-NULL) gates it; resolution falls to the fallback first.

### 5.2 The area

```ts
export function sumOpeningAreaM2(rows: { dims_json: string; qty: number }[]) { … }

export async function loadProjectAreaM2(env: Env, projectId: string) {
  const { results } = await env.DB.prepare(
    // PARENTS ONLY. No ORDER BY — a sum has no order.
    `SELECT dims_json, qty FROM quote_line
      WHERE project_id = ? AND revision_id IS NULL AND parent_line_id IS NULL`,
  ).bind(projectId).all();
  return sumOpeningAreaM2(results ?? []);
}
```

**Millimetres are parsed by value, not by JSON type.** `dims_json` is written `{"width":"2050"}` by every customer save and was written `{"width":2050}` by the AI proposal path. That exact mismatch already cost this codebase every price on an AI-quoted project — see the `dimsEq` comment at `worker/lib/lines.ts:281-290`. This is the known shape of the stored data, not defensive programming.

**Parents only**, and the predicate is not a choice made here — it is the same one every money total already uses (`worker/routes/projects.ts:36-38` states the rule and the reason in a comment). Three consequences:

1. Summing both levels **double-counts a composite**. A 3600 mm opening built as three 1200 mm units would contribute the opening *and* its units — the freight on one hole in a wall, charged twice. That is the same failure class as the revision double-charge already recorded in this repo's test suite (*"a project ops priced at $9,800 issued at $16,400"*).
2. The parent's `dims_json` is the **opening's own size and never changes** when it becomes a composite (`worker/lib/composite.ts`, invariant 1), so the area is stable across a split, a merge and a reviewer resizing a unit.
3. `qty` is the **parent's** qty. A segment's `qty` is derived as `parent.qty × qty_per_parent` (invariant 3), so reading segment qty multiplies the parent count in twice.

**The area is derived from DIMENSIONS, never from money.** An unpriced line still contributes its area — so a project that reaches submit with a `technical_review` line whose `line_total` is NULL still gets a figure. And no discount, surcharge or modifier can leak into the freight basis, which is §5.4.

Lines whose width or height will not parse contribute **0** and are counted, becoming a caveat sentence. Not silently dropped, not guessed at.

### 5.3 Postcode → zone

```ts
const AU_POSTCODE = /^\d{4}$/;

/** Four digits or nothing (decision 7). Kept as TEXT so 0872 survives.
 *  A NUMBER IS NOT A POSTCODE: normalisePostcode(3000) is null, not "3000".
 *  The moment 3000 is accepted, `3000` and "3000" are two spellings of one place
 *  and something downstream will compare them. */
export const normalisePostcode = (raw: unknown): string | null =>
  typeof raw === "string" && AU_POSTCODE.test(raw.trim()) ? raw.trim() : null;
```

The resolver **always returns a zone, never null** (D9), through four ordered branches:

| # | Branch | `basis` | When |
|---|---|---|---|
| 1 | narrowest matching **priced** range | `postcode_zone` | the ordinary path |
| 2 | fallback zone | `fallback_zone` | no postcode, not four digits, no matching range, or the matched zone is unpriced |
| 3 | fallback zone | `fallback_zone` | matched zone `active = 0` |
| 4 | *no answer* | `unpriced_table` | the fallback itself has NULL rates |

Branch 2 covers the case where a postcode matches an **unpriced** zone that sits inside a **priced** container — say `act` unpriced inside a priced `nsw-regional`. It falls to the fallback, not to the container. A zone the owner created and left unpriced is one he intends to price *differently*; substituting its container's number silently reuses a rate he explicitly declined.

**Branch 4 is a deployment fault, not a business state.** It occurs only when the fallback zone has no rates — i.e. before the owner has entered the three numbers §13 asks for. The customer-facing surface is not enabled until then (§11, C-gate), the ops console shows *"no zone in this deployment carries a rate"*, and the issue gate already guarantees no quote leaves with it because a human must type a figure. **D9 is not re-opened here and "show nothing" is not proposed as a business rule.**

`basis` and the caveat sentences ride on the estimate and are rendered verbatim in the ops delivery block, so *why* a figure may be wrong is words rather than a boolean.

### 5.4 Account discounts, and why they structurally cannot reach delivery

`worker/lib/estimator/pricing.ts:189-196` applies `discountPercent` to the per-unit subtotal, after the minimum charge and the modifiers, before `round10`. The percentage is resolved server-side from `user.discount_percent` (`0032:21`) and never read from a request — there is already a test that a `discountPercent` in the payload is ignored.

Delivery sits outside it in three independent ways, any one of which would be sufficient:

1. **Structurally.** `worker/lib/delivery.ts` does not import `loadAccountDiscount`, does not call `computePrice`, and **no function in it takes a user**. `resolveZone` takes a postcode; `loadProjectAreaM2` takes a project id. There is no parameter through which an account could be threaded without someone deliberately adding one.
2. **By the choice of basis.** The input is millimetres. A discount cannot leak in through millimetres. This is the second reason area rather than price drives the freight, and it belongs in the module comment: a future change that derived freight from the goods subtotal would silently make delivery discountable and *nothing would fail*.
3. **In the composed total.** `goodsTotal` is already discounted per line; `delivery` is added afterwards; the quote names them separately. A 5% trade account on a $50,000 job pays $47,500 of goods **plus the full delivery**, and the "5% off" the account was promised remains exactly true of goods.

Guarded by a test (**T-B7**) that runs the same lines and the same postcode through an anonymous and a discounted account and asserts the goods differ while the delivery estimate is byte-identical.

### 5.5 The estimate is computed live, and stamped once

**This was the single largest unresolved contradiction across the drafts and it is settled here.** Two drafts stored the machine estimate on the project and refreshed it from four trigger points; two computed it on read and argued that storing it defeats D19. Both arguments are correct about different things, and the resolution is that they are asking about different numbers:

- **What does the table say NOW?** — computed live on every ops read. This is what makes rate drift visible: the owner corrects a rate and the estimate on every open job moves with it, which is the point of D19.
- **What did the table say when a human overrode it?** — `delivery_settle_json`, stamped once at the instant of settling and never touched again. This is what makes an override a data point: without it, a rate correction rewrites the comparison that justified the override.

Storing both costs one JSON column. Storing only the live one loses the calibration data. Storing only the stamped one shows a stale figure that looks exactly like a fresh one.

Computing live also deletes a great deal of machinery: there is no `refreshDeliveryEstimate`, no trigger table, no "should the estimate be recomputed after an ops line edit" question, no staleness badge, and no risk that a project whose lines changed carries an estimate computed for a smaller job. Six of the seven ops mutations that change opening area do **not** bump `quote_edit_version` — verified: the only bump in `worker/routes/ops.ts` is at `:879-882`, inside `ops.patch("/lines/:id")`; the split, merge, segment and estimate routes do not, and `worker/lib/composite.ts` never touches it. A stored estimate would go stale on six paths with no signal. A live one cannot.

**The cost** is two extra D1 reads on the ops project GET and on the customer's pending-record read. That is acceptable on those surfaces and it is *not* extended to the builder, where nothing computes delivery at all.

### 5.6 GST

Zone rates are authored **GST-inclusive** and `deliveryCost` performs no GST arithmetic. That is the existing rule, not a new one: catalogue prices are stored GST-inclusive, `quoteSummary.total` is documented *"GST-INCLUSIVE … display mode is applied by the renderer via `gstAdjust` — never baked in here"* (`src/data/quoteSummary.ts:21-23`), `pricing_policy.gst_mode` is `'inc'`, and `computePrice` has no GST term in its ninety lines. D16 says delivery is the same, so it needs no term either.

Every surface renders `fmt(gstAdjust(amount, gstMode))` with `gstSuffix(gstMode)` beside it. `gstAdjust` is linear, so the display must adjust **the sum, once** — adjusting each part independently gives a customer viewing ex-GST two roundings that do not add up on screen.

**The real exposure is data entry, not arithmetic.** Carrier invoices are commonly quoted ex-GST, the owner types thirty-six numbers by hand (D20), and the only control today would be a field label reading `(inc GST)`. A `$900` cap typed from a `$900 ex-GST` quote under-recovers 10% on every capped job, silently, forever. **The zone editor therefore shows the ex-GST equivalent live beside each field** — one derived number, no new decision, and it makes the mistake visible at the moment it is made.

---

## 6. THE API SURFACE

| # | Method + path | New/changed | Gate | File |
|---|---|---|---|---|
| E1 | `GET /api/ops/pricing/delivery-zones` | new | `gate(c,"view")` | `worker/routes/ops-pricing.ts` |
| E2 | `POST /api/ops/pricing/delivery-zones` | new | `gate(c,"edit")` | `worker/routes/ops-pricing.ts` |
| E3 | `PUT /api/ops/pricing/delivery-zones/:id` | new | `gate(c,"edit")` | `worker/routes/ops-pricing.ts` |
| E4 | `DELETE /api/ops/pricing/delivery-zones/:id` | new | `gate(c,"edit")` | `worker/routes/ops-pricing.ts` |
| E5 | `POST /api/ops/pricing/delivery-zones/preview` | new | `gate(c,"view")` | `worker/routes/ops-pricing.ts` |
| E6 | `GET /api/ops/projects/:id` | changed — `delivery` key, `order.total` | `resolveStaff` | `worker/routes/ops.ts:390` |
| E7 | `PUT /api/ops/projects/:id/delivery` | new | `resolveStaff` | `worker/routes/ops.ts` |
| E8 | `POST /api/projects/:id/submit` | changed — postcode required | owner | `worker/routes/quote.ts:101` |
| E9 | `POST /api/projects/:id/delivery-estimate` | new | owner | `worker/routes/quote.ts` |
| E10 | `POST /api/ops/projects/:id/issue-revision` | changed — new refusal | `canIssueQuote` | `worker/routes/ops.ts:1043` |
| E11 | `POST /api/projects/:id/issue-revision` | changed — same, the twin | role list | `worker/routes/quote.ts:299` |
| E12 | `GET /api/projects/:id/revisions` | changed — `goods`/`delivery`/`deposit` | owner | `worker/routes/quote.ts:310` |
| E13 | `GET /api/projects`, `GET /api/projects/:id` | changed — `delivery` on the DTO | owner | `worker/routes/projects.ts` |
| E14 | `GET /api/orders`, `/api/orders/:id` | changed — `delivery`, `goods` | owner | `worker/lib/orders.ts:90` |

E1–E5 need **no registration change**: `worker/routes/ops.ts:44` already mounts the sub-router, so `/delivery-zones[/:id]` is served under `/api/ops/pricing/*`.

### 6.1 One prerequisite nothing else mentions

`worker/lib/pricing-admin.ts:49` types the table union as:

```ts
table: "pricing_rate_card" | "pricing_option_surcharge" | "pricing_modifier" | "pricing_policy";
```

**`applyPricingChange` cannot accept `"delivery_zone"` until that union is widened.** `npm run typecheck:gate` runs first in `npm test`, so this is a hard blocker, not a lint. It is one word, and it is on the C3 touch list in §11.

(While there: `applyPricingChange` no longer records anything after `0042` — it takes `before`/`after` and uses only `before.version`. Any comment describing it as "records before/after" is describing a function that stopped doing that on 2026-08-13. `worker/routes/ops-pricing.ts:33-36` still cites a ±20% typed-slug tripwire that was removed the same day; both are corrected in C9.)

### 6.2 The zone endpoints

All five follow the conventions of `PUT /rate-cards/:id` (`worker/routes/ops-pricing.ts:226-258`) exactly: `gate()` in two lines, read `before` → 404, `await c.req.json().catch(() => ({}))`, `num()` coercion with fall-back-to-stored, negative → `400 invalid_amount`, `applyPricingChange` with `expectedVersion`, `VersionConflict` → `409 version_conflict`, and **`canEdit: canEdit(staff)` on every GET** because that is how the console decides whether to render controls.

Zone-specific refusals:

| Code | Status | When |
|---|---|---|
| `max_below_min` | 400 | a cap under a floor is a formula that always returns the floor |
| `invalid_range` | 400 | `pc_from`/`pc_to` outside `0200…9999`, or reversed |
| `range_overlap` | 409 | a submitted range **partially** intersects another zone's. Full containment is permitted — it is the layering mechanism (§4.4). Body carries the conflicting rows. |
| `cannot_delete_fallback` | 400 | id is `unmapped` |
| `id_taken` | 409 | matching `ops-pricing.ts:122` |

`E2` (create) seeds **NULL rates**, not the fallback's numbers: copying `unmapped`'s deliberately-high figures into a new metro zone produces a plausible-looking wrong price, and a NULL zone is visibly unfinished.

`E4` (delete) does **not** refuse when projects reference the zone — the estimate is computed live from the postcode, so a deleted zone simply stops matching and those postcodes fall to the fallback, which is the dearest row. The `ON DELETE CASCADE` on `delivery_postcode_range.zone_id` is declared in the schema (§4.4) rather than assumed: foreign keys are enforced in this deployment, and `migrations/0033` documents a real 500 caused by exactly that assumption.

`E5` (preview) always returns `ok: true` with a number, per D9. `400 invalid_postcode` is reserved for input that is not four digits — a malformed request, not an unpriced destination.

### 6.3 `E7 — PUT /api/ops/projects/:id/delivery`

```jsonc
{ "amount": 340,      // number ≥ 0, or null to un-settle
  "postcode": "3073", // staff correction of what the customer typed
  "note": "…" }       // ≤ 500 chars, trimmed
```

Returns the recomputed `delivery` object. Errors: `404 not_found`, `400 invalid_amount`, `400 invalid_postcode`, `409 locked`.

**Editable set** = `ISSUABLE_FROM` (`worker/lib/revisions.ts:92-95`) plus `draft`. Once `status_internal='issued'` the figure is frozen into the revision and honoured (D12); a project-level edit then would desync the record from the document the customer is reading. `request-changes` returns the project to `estimator_assigned` (`worker/routes/quote.ts:365-373`) and the field becomes editable again for the next revision — correct, because the next revision re-freezes it.

`amount: null` un-settles and re-arms the gate. That is the honest way to say *"I typed a number and I now think it is wrong"*, and it is why `settled` is a nullness test: `0` is a decision, `null` is its absence.

**It does NOT bump `project.quote_edit_version`.** Two reasons, both verified. A bump would collide with `issueRevision`'s own concurrency guard, and `issueRevision` collapses *every* refusal into one code (the batch `catch` at `worker/lib/revisions.ts:214-222` and the commit proof at `:223-226`) — so a staffer setting delivery while a colleague clicks Issue would be told *"delivery is not set"* immediately after setting it. Instead the issue guards on the delivery figure directly (§6.4), which is precise and cannot be misattributed.

Every write logs through the existing helper, so the override lands in the History block for free with both numbers in it:

```ts
await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: id,
  action: `set delivery to ${money(amount)} (machine estimate ${money(estimate)}, zone ${zoneId})` });
```

### 6.4 `E10 / E11` — the issue gate and the freeze

`IssueResult` (`worker/lib/revisions.ts:14-16`) gains a code:

```ts
export type IssueResult =
  | { ok: true; id: string; revisionNo: number; total: number; goods: number; delivery: number }
  | { ok: false; error: "not_found" | "not_ready" | "delivery_unset" };
```

Both routes already map anything that is not `not_found` to 409 (`worker/routes/ops.ts:1049`, `worker/routes/quote.ts:305`), so **neither route needs an edit** for the new code.

**A distinct code, not a fourth `not_ready`, and this is not cosmetic.** `ACTION_ERRORS` (`src/ops/ProjectRecord.tsx:56-69`) has **no `not_ready` key at all** — verified. A `not_ready` refusal renders as the generic *"That action could not be completed."*, which is precisely the useless message that map exists to avoid. `ACTION_ERRORS` gains:

```ts
  delivery_unset: "Delivery has not been set on this project — enter a figure, or 0, in the Delivery panel.",
```

**GUARD 8**, placed after the technical-review guard (`revisions.ts:141`) and before the total is computed (`:152`):

```ts
  // Delivery must be SETTLED, not non-zero. A trade customer arranging their own
  // freight is priced at 0 and that is an answer; NULL is the absence of one, and
  // issuing on it freezes a figure nobody has looked at into a document the
  // business then has to honour (decision 12).
  if (project.delivery_amount == null) return { ok: false, error: "delivery_unset" };
```

It goes **after** the line guards so a job with both problems reports the line problem first — lines are the reviewer's actual work, delivery is one field, and a gate that surfaces the trivial blocker while hiding the substantial one trains people to distrust it.

**The freeze is guarded on the figure itself.** The revision INSERT's existing `WHERE EXISTS (SELECT 1 FROM project WHERE id=? AND quote_edit_version=?)` (`revisions.ts:162-168`) gains `AND delivery_amount IS ?`, bound to the value read at the top. `IS` rather than `=` because it is NULL-safe by construction even though the guard above has already excluded NULL. The issue freezes exactly the delivery figure it read, or it fails.

Then `:152` and `:168`:

```ts
  const goods = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const delivery = project.delivery_amount;
  const total = goods + delivery;
  // … totals_json := { total, goods, delivery, deliveryPostcode, deliveryZoneId, deliveryAreaM2 }
```

plus `quote_revision.delivery_total` bound in the same INSERT.

### 6.5 Re-issue re-arms the gate

Verified: `worker/routes/quote.ts:365-373` (`request-changes`) sets `status_internal='estimator_assigned'`, which is in `ISSUABLE_FROM`, and `delivery_amount` survives from R1. Without a change, **the gate is armed exactly once per project, ever** — R2, R3 and R4 issue with R1's freight figure no matter how much the line set changed in between. The same applies to `clarification-reply` (`worker/routes/quote.ts:53-95`), which also returns to `estimator_assigned`.

Both are already a single `D1.batch` containing a project `UPDATE`. Each gains four `SET` clauses:

```sql
  delivery_amount = NULL, delivery_note = NULL,
  delivery_settled_at = NULL, delivery_settle_json = NULL,
```

`delivery_postcode` is **not** cleared — the destination has not changed, only the price of getting there. This also resolves the destination-change case: a customer who writes *"actually, deliver to Cairns"* in a change request lands in `estimator_assigned` with the gate re-armed, staff correct the postcode via E7, and the new figure is frozen on R2. **A destination change is a new revision, never an edit to an issued one.**

### 6.6 `E9 — POST /api/projects/:id/delivery-estimate`

Owner-scoped (`ownedProject`, the same guard as everything else on that project). Body `{ "postcode": "3072" }`; returns `{ amount, zoneLabel, conservative, ok }`. Writes nothing.

POST with a body, not a query string — a postcode is part of the customer's address and does not belong in a URL.

**This endpoint exists for the submit screen and must never be called from the builder.** Its existence is the mechanism by which delivery could leak into the running estimate, which D8 forbids for reasons that have nothing to do with the submit screen. The guard is a test on `quoteSummary()` (**T-A16**), not a code comment.

### 6.7 `E6`, `E12`, `E13`, `E14` — the read paths

**E6.** One additive top-level `delivery` key, alongside `payments` — exactly as the Slice 1 note at `worker/routes/ops.ts:503-505` describes. The project row is fetched with `SELECT p.*` (`ops.ts:392-397`), so **the six new project columns reach the DTO source with no query change**; only the shaping needs writing.

```jsonc
"delivery": {
  "postcode": "3072", "suburb": "Preston",
  "zoneId": "vic-metro", "zoneLabel": "Melbourne metro",
  "basis": "postcode_zone", "caveats": [],
  "areaM2": 12.4, "ratePerSqm": 18, "minCharge": 250, "maxCharge": 1400,
  "estimate": 250, "bound": "min",         // LIVE, from the current table
  "amount": 340,                            // null ⇒ NOT SETTLED. 0 is settled.
  "settled": true,
  "settledEstimate": 250, "settledAreaM2": 12.4, "settledZoneVersion": "v3",
  "note": "Two 2.4 m stackers — carrier quoted an oversize surcharge.",
  "settledAt": "…", "settledBy": "u_staff1",
  "editable": true
}
```

**The order sub-object gains `total` and `deliveryTotal`.** Verified: the query at `worker/routes/ops.ts:423-428` does not even `SELECT total`, and the DTO at `:533-539` does not expose it. Without both, the ops record header keeps summing `order_line` (`src/ops/ProjectRecord.tsx:169`) and understates every contract by the freight — on the same screen as the Payments block showing the correct invoice.

**E12.** `worker/routes/quote.ts:316-325` gains `goods`, `delivery`, `deliveryPostcode`, `deposit` and `balance`, each defaulted so pre-feature revisions read as delivery-free:

```ts
const t = safeParse(r.totals_json);
const delivery = t.delivery ?? 0;
const goods = t.goods ?? t.total ?? 0;
```

`deposit`/`balance` come from the server (§4.3), which is what lets the browser stop computing them.

**E13.** `GET /api/projects` gains `delivery_amount` on the summary row (`confirmed ?? live estimate`) and `GET /api/projects/:id` gains `delivery: { postcode, amount, indicative }`, where `indicative` is `status_customer` not in `quote_issued`/`accepted`. That flag selects between the two microcopy states in §9 — the browser must not infer it from status strings in three places.

**E14.** `orderDto` (`worker/lib/orders.ts:90-112`) gains `goods` and `delivery`, from `"order".delivery_total`. `src/pages/RecordDetailPage.tsx:308-309` prints `Contract total` with no breakdown; with delivery inside `order.total` and no `order.delivery`, the customer's post-acceptance screen shows a number simply larger than the lines sum to. That is the failure this field prevents.

### 6.8 `worker/lib/orders.ts:141` — the line this feature dies on

```ts
const total = revLines.reduce((s, l) => s + (l.line_total || 0), 0);
```

It re-derives the order total from `revision_line` and **never reads `totals_json`**. A project-level charge lives on the header and on no line, so unless this changes, the delivery amount is present on the quote the customer accepted and **absent from `"order".total`, `payment.deposit.amount` and `payment.balance.amount`** (`:142-143`, `:192`, `:200`, `:205`).

Nothing throws. Every screen stays internally consistent — `RecordDetailPage`'s contract total reads `order.total`, the payment rows read `payment.amount`, and all of them agree with each other and disagree with the document the customer accepted. The loss is exactly the delivery figure on every order, forever, and it surfaces when someone reconciles a bank statement.

```ts
const goods = revLines.reduce((s, l) => s + (l.line_total || 0), 0);
const delivery = rev.delivery_total ?? 0;           // read in the same batch
const total = goods + delivery;
const deposit = Math.round(total * DEPOSIT_PERCENT / 100);
const balance = Math.round((total - deposit) * 100) / 100;
```

`"order".delivery_total` is bound in the same INSERT. `order_line` is untouched — no delivery row, ever (D17).

---

## 7. THE OPS UI

### 7.1 The project record — where the block goes

**Right rail, between Payments and Files** — inserted after `src/ops/ProjectRecord.tsx:420` (the `)}` closing `{order && …}`) and before `:422` (`<Block title="Files" …>`). The rail container at `:400` is `space-y-4`, so spacing is automatic, and `Block` (`:833-845`) supplies the card shell.

The rail, not the main column. The main column is *what is being built* — lines, thermal, learning, notes. The rail is *what is true about this job* — money, files, history. Delivery sits directly under Payments because those are the only two money panels on the screen and the reviewer's question is always "what will this person be invoiced".

It renders **unconditionally**, unlike Payments. A project with no postcode must show *that*, not nothing — an absent panel is indistinguishable from an empty one, and the point is that the reviewer notices.

```
┌─ DELIVERY ─────────────────────────────── 3072 ─┐
│  Preston VIC 3072            ← project.delivery_suburb, first time it is shown
│  Melbourne metro · 12.4 m²
│  ──────────────────────────────────────────────
│  Machine estimate                        $250
│    12.4 m² × $18/m² = $223 → floored to $250
│  ──────────────────────────────────────────────
│  Confirmed                               $340
│                                  +$90 · +36%
│  ──────────────────────────────────────────────
│  Two 2.4 m stackers — oversize surcharge.
│  u_staff1 · 12 Aug 23:14
│  the table now says $310          ← only when live ≠ settled estimate
│
│  [ $ 340      ] [ note…          ] [ Save ]
│  Enter saves, Esc reverts. 0 is a valid answer —
│  use it when the customer arranges freight.
└──────────────────────────────────────────────────
```

**Unsettled** — the state the gate cares about — replaces the Confirmed row with warning-ink text (*"Not set — the quote cannot be issued until it is"*) and pre-fills the input with the machine estimate.

**Unmapped postcode** — D9's surface — reads `0872 · no zone matched` in warning ink, `Priced as Unmapped postcode (fallback)`, and prints the resolver's caveat sentences verbatim under the estimate.

| Element | Why it is there |
|---|---|
| Destination | The reviewer's first question. `deliverySuburb` has been in the DTO since `worker/routes/ops.ts:471` and rendered nowhere; this is the first screen that reads it — and it is what lets a staffer spot `3730 · Regional VIC` sitting beside the word "Preston". |
| Zone + area | Traces a wrong price to a wrong row in one hop instead of by opening the zone editor and reading ranges. |
| Machine estimate + the working | D19. The one-sentence working is the rate-card detail view's worked example compressed to a line. |
| **Confirmed** | The number that is issued, invoiced and honoured. Visually heaviest thing in the panel. |
| Delta | `+$90 · +36%` is what tells the owner his metro rate is low, and it accumulates in the History log. |
| Note + attribution | Ten deltas with reasons are a rate revision. Ten deltas without are noise. |
| Drift footnote | Only when the live estimate differs from the stamped one — how a reviewer opening an old job learns the rates moved under it. |
| **% of goods** | `$450 · 58% of goods` beside the figure. The cases worth a phone call announce themselves (risk 4). |

**The estimate never disappears when the confirmed number arrives.** That is D19 as a layout rule: two rows, always both present once settled, estimate above, confirmed below and heavier. Replacing one with the other — the obvious space saving — destroys the only signal the owner has that his guessed rates are wrong.

Editing is inline, same grammar as the Options tab (`src/ops/Pricing.tsx:868-876`): local draft state, Enter commits, Escape reverts, save appears only when changed. On success, `load()` (`:110-133`) re-fetches, which also refreshes `ws.actions` — so the Issue button un-blocks in the same paint. That is what makes the gate feel like a checklist rather than an obstacle.

**No new action id.** The panel's own save is the control. Adding a `set-delivery` button to the actions row would require a matching case in the hand-written `perform` switch at `:145-153` (or it renders and silently does nothing), and a button that opens a panel in the rail is a worse UI than the panel's save.

Read-only when `editable === false`, footed with *"Issued at $340 — fixed for this revision."*

### 7.2 The header total

`src/ops/ProjectRecord.tsx:169` is a client-side reduce over line totals and `:202` prints it. It becomes three cases, because the screen has three tabs and each has a different authority:

```tsx
  const goods = rows.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
  const del = ws.delivery?.amount ?? null;
  // Which figure is authoritative follows the tab. Summing lineTotal on the
  // issued and contract tabs would reproduce orders.ts's own defect on screen —
  // freight present in the document and absent from the number beside it.
  const total = showingContract ? (order?.total ?? goods)
    : revisionId ? (ws.revisions.find((r) => r.id === revisionId)?.total ?? goods)
    : goods + (del ?? 0);
```

`ws.revisions[].total` already parses `totals_json` at `worker/routes/ops.ts:500`, so the middle branch needs no DTO work. The caption at `:203-205` gains a second line — `delivery not set` in warning ink, or `incl. $340 delivery` — so an unsettled job reads `$12,400 / estimate / delivery not set` before the reviewer scrolls.

### 7.3 Ops → Pricing → Delivery zones

Three mechanical edits to the shell:

1. `src/ops/Pricing.tsx:53` — widen the union with `"delivery-zones"`.
2. `:54-59` — insert `{ id: "delivery-zones", label: "Delivery zones" }` after Options, before Policy. Array order is tab order.
3. `:94-97` — thread a branch into the nested ternary **before** the `<CatalogueMirror />` fall-through.

`HealthBanner` renders above the tab bar on every sub-tab by design, so the zones screen inherits it.

```
Delivery zones                       15 zones · 4 unpriced · 2,841 postcodes mapped

⚠ 3200–3207 partially overlaps Regional VIC. Full containment is fine;
  a partial overlap means the first match wins, which is not a decision anyone made.

Zone               Postcodes             $/m²    Min      Max     12 m²   Ver
────────────────────────────────────────────────────────────────────────────────
Melbourne metro    3000–3207, 3750–3810 [ 18 ] [ 250 ] [1400 ]    $250 ↓  v3
                                       $16.36  $227.27 $1272.73         ← ex GST
Regional VIC       3211–3999           [    ] [     ] [     ]  not priced  v1
…
Unmapped  ◦ fallback  everything else  [ 95 ] [ 900 ] [2600 ]  $1,140    v1
────────────────────────────────────────────────────────────────────────────────
Enter saves a row, Esc reverts. The 12 m² column is a worked PRICE, not a rate.
↓ floored · ↑ capped. Rates are entered inc GST; the grey line is the ex-GST value.
```

**Inline editing, not a detail view — and the existing rule at `src/ops/Pricing.tsx:10-14` has to be answered rather than sidestepped.** It says rate cards open a detail view because their effect is *"dimensional and non-obvious"*, and options are inline because a flat surcharge is *"linear and bounded"*.

A zone fails the rate-card test on the clause that matters. A rate card carries **two rates over two different dimensions** — `perimRate` in $/m and `areaRate` in $/m² — combining into a unit price where neither input's contribution is legible. A zone has **one dimension and one rate**; `minCharge` and `maxCharge` are not rates at all, they are prices, in dollars, in the same unit as the answer. The single opaque number is `$/m²`, and the device that makes it legible — a worked example — costs one column here rather than one screen.

The stronger argument is that **zones are edited as a set, against each other**. The owner is guessing initial rates and will correct them from invoices, and every correction is relative: WA metro must sit above SA metro, regional above metro, remote above everything. A detail view shows one zone and hides its fourteen neighbours — it hides the comparison that makes the number right. Rate cards are per product and genuinely independent.

The header comment at `:10-14` is **rewritten** to describe three cases. A comment that describes two is a comment the next person reads and disbelieves.

Delete uses `window.confirm` and is hidden for `unmapped`, exactly as `:362-372`/`:410-415` do for `default`. Create uses the inline `New zone` row from `:181-221`. Version conflicts print `:353-355`'s sentence.

---

## 8. THE CUSTOMER UI

### 8.1 The builder — nothing changes, and a test says so

`src/data/quoteSummary.ts:48` and `src/components/quote-project/ProjectActionBar.tsx:129-147` are untouched. **T-A16** asserts that `quoteSummary` has no delivery term, and it goes in *before* the commit that could break it, because D8 is a promise about a screen the customer is looking at while they build.

### 8.2 The submit form

`src/components/QuoteReviewSubmit.tsx:125` is one free-text input labelled *"Delivery suburb / postcode"*, stored whole and never parsed. It becomes **two fields**, because the price is derived from four of those characters and extracting them from free text is the step that fails silently.

**Three prerequisites in `src/app/ui.tsx`, none of them optional:**

- `Input` (`:112`) accepts exactly `value, onChange, placeholder, type, className, defaultValue, inputMode, disabled, maxLength, onKeyDown, autoFocus`, **has no rest-spread**, and its own comments record two previous occasions when a prop was passed and silently dropped. It must gain `id`, `autoComplete`, `aria-invalid` and `aria-describedby`.
- `FieldLabel` (`:104-110`) renders a bare `<label>` with **no `htmlFor`**, and it is a *sibling* of the input, not a wrapper. It must gain `htmlFor`. Without this, `page.getByLabel(/Delivery postcode/i)` cannot resolve and the Playwright tests in §10 are unwritable.
- This file has **no per-field error slot** — `:128` is a single form-level banner above the CTA. The postcode is the first field with a format, and it gets the first per-field error.

```tsx
<div>
  <FieldLabel htmlFor="delivery-postcode">Delivery postcode</FieldLabel>
  <Input id="delivery-postcode" value={postcode} inputMode="numeric" maxLength={4}
    autoComplete="postal-code"
    aria-invalid={!!postcodeError || undefined}
    aria-describedby={postcodeError ? "postcode-err" : "postcode-help"}
    onChange={e => { setPostcode(e.target.value.replace(/\D/g, "").slice(0, 4)); setPostcodeError(""); }}
    placeholder="3072" />
  {postcodeError
    ? <p id="postcode-err" role="alert" className="text-red-700 mt-1 t-cap">{postcodeError}</p>
    : <p id="postcode-help" className="text-body mt-1 t-cap">We price delivery from this.</p>}
</div>
```

**The CTA gate at `:129` gains the postcode**, and `handleSubmit` (`:69-91`) also checks it so the message says which field is wrong.

**One dependent fix, required in the same commit.** `src/data/api.ts:80-88` (`req`) throws away the server's error body, and `src/app/App.tsx:2074-2107` collapses every rejection to `"rejected"`, which the form renders as *"check that every line is priced and your item codes are unique."* A customer typing three digits would be told to fix their item codes. The ops client already solved this — `OpsApiError` (`src/ops/api.ts:371-373`) reads the body and carries `code`. Port that shape to `submitProject`. Without it, the field-level copy above is unreachable.

`SubmitContact` (`src/data/api.ts:275`) gains `postcode: string` — **required, not optional**, so a caller that forgets it fails to compile.

### 8.3 The delivery figure at submit

**This is the one customer-facing decision the locked list does not settle, and it is Q1.** The design below is what I recommend and what the commit sequence builds; the owner's answer changes one commit and nothing else.

Once four digits are entered, the panel gains a delivery row via E9:

```
  Windows and doors                              $18,400 inc GST
  Delivery to 3072                                  $ 640 inc GST
  ─────────────────────────────────────────────────────────────
  Project total                                  $19,040 inc GST
  An estimate. A person checks the delivery against real freight
  before your quote is issued.
```

The panel notice at `:127` changes so the number above is never read as a promise:

> *Delivery is priced from your postcode and confirmed on technical review. Estimated totals are confirmed on that same review. No deposit until you approve the reviewed quote. Supply only — tailgate to the kerb, and installation is not included.*

Why I recommend showing it: D8 calls this *"the standard e-commerce model"*, and the standard e-commerce model shows shipping at checkout. D9 requires a number rather than nothing, which is only meaningful if the customer sees one somewhere. And the alternative — a 58% surcharge on a small order revealed only after commitment (risk 4) — is the most likely source of abandonment and complaint, manufactured by hiding it.

Why it is a question and not a decision: D8's stated reasons are about the *builder*, not the submit step, so extending them to this screen is an interpretation, and it is the owner's business call.

### 8.4 Pending, and issued

**Pending** (`submitted` / `under_review` / `needs_information`) — `indicative: true`, `amount = confirmed ?? live estimate`, never null:

> **Delivery to 3072 — around $250.** An estimate. A person checks it against real freight before your quote is issued.

Unmapped: *"That postcode is outside our usual runs, so we've allowed generously. A person checks it before your quote is issued, and it may come down."*

Never *"we'll quote delivery separately"*, and never a blank (D9).

**Issued** — `src/pages/QuoteReviewPage.tsx`. `:64` gains `goods` and `delivery` from E12; the deposit comes from the server (§4.3). The totals block at `:180-185` gains two rows **above** the ex-GST subtotal:

```tsx
<TotalRow label="Windows and doors (inc GST)" value={money(goods)} />
<TotalRow label={`Delivery to ${current.deliveryPostcode ?? "your site"} (inc GST)`}
          value={delivery === 0 ? "$0" : money(delivery)} />
```

The acceptance-preview receipt at `:145-149` gains the same line — that panel is the last thing read before an irreversible click. (The block at `:189-200` is the **revision-history list**, not a summary band; nothing is inserted there.)

Copy, issued:

> **Delivery — $340 to 3072.** This is the price. Tailgate to the kerb at your address; you unload.

**Issued at zero:** *"Delivery — $0. Delivery is not charged on this quote."* — and nothing more. The reason for a $0 is **not** stated to the customer. D14 gives the trade-waiver case, but staff will zero the field for other reasons (a goodwill absorb, a bundled job, a correction), and *"You're arranging your own freight"* would be false on those. `delivery_note` stays staff-only; a note field that is sometimes customer-visible is a note field staff stop writing candidly in.

**Two sentences that appear in no draft of this document and must not appear in the product:** anything telling the customer the business absorbs freight overruns (D12 is an internal accounting decision, not a public commitment), and anything about collecting units from a carrier (D15 dropped pickup; inventing a collection step is the idea it exists to remove).

**The word that changes meaning between the two states is *estimate*.** Pending: *"around $250 — a person checks it."* Issued: *"$340. This is the price."* The site already draws that line everywhere else; delivery must sit on the same side of it in both states, or it becomes the one number on the page whose status nobody can tell.

---

## 9. COPY CHANGES

`src/` was grepped for two distinct claim classes: the **delivery-service** claim (`door.to.door|to your door|hand over|kerb|tailgate|deliver(y|ed)? (to|at) your`) and — because D1 makes it necessary and no earlier pass covered it — the **manufacturing-location** claim (`our factor|from our showroom|we manufacture`).

| # | File:line | Current | Change |
|---|---|---|---|
| 9.1 | `src/pages/ProductsPage.tsx:41` | *"Delivered Australia-wide — Door-to-door, from our factory to your site."* | *"Delivered Australia-wide — Tailgate to the kerb at your address. You unload; the delivery is quoted with the frames."* |
| 9.2 | `src/pages/HowItWorksPage.tsx:116` | *"Supply only — your builder or installer fits the frames. We hand over at your address."* | *"Supply only — your builder or installer fits the frames. We deliver by tailgate to the kerb at your address; unloading is yours to arrange."* |
| 9.3 | `src/pages/HowItWorksPage.tsx:108` | *"Delivered to your door … Australia-wide, with after-sales support from there."* | *"Delivered to your kerb … Australia-wide, tailgate to the kerb. After-sales support runs from there."* |
| 9.4 | `src/app/App.tsx:681` | *"We manufacture and deliver from our showrooms in {suburbs}."* | *"Anywhere in Australia. Our showrooms in {suburbs} are for seeing the frames and talking them through — every unit is built to order and delivered to your site. Give us the delivery postcode and the delivery is quoted with the frames."* |

**9.1 and 9.2 are named by D18.** 9.3 is the same claim in the same file twelve lines from the footnote that annotates it — changing 9.2 and leaving 9.3 makes the page contradict itself. **9.4 is required by D1, not optional**: showrooms are display and appointment only, and "we manufacture … from our showrooms" is the exact sentence D1 exists to correct.

The bar these must clear is set by the comment directly above the array at `ProductsPage.tsx:32-36`: *"Every line here is checkable and is already stated elsewhere on the site … 'Quality you can trust' and 'Checked by our team' were the previous wording — assertions with nothing behind them."* Both halves of 9.1's replacement are checkable, and the second half becomes literally true at submit.

**Reviewed and deliberately not changed**, so nobody re-opens it:

- `src/pages/ProductsPage.tsx:41`'s sibling, *"Supply only — **We manufacture and deliver.** Installation is arranged by your builder or installer."* — this is a supply-versus-install claim, not a location claim. AMJ is the manufacturer of record. **Flagged as Q9** because it sits one line from a string D18 does change, and the owner should confirm rather than have it assumed.
- `src/app/App.tsx:633` — *"…then we deliver."* No location and no service claim.
- Every hardcoded `"50%"` string. True, and staying true.

---

## 10. TDD PLAN — the tests, enumerated

Written before the code they name, in the order the code lands. The order is not stylistic: each level's failure is only legible once the level below it is green — a wrong order total cannot be told from a wrong rate until the rate is proven, and the freeze cannot be exercised until the gate lets a settled quote through.

### 10.0 The harness commit — GREEN on arrival

> ⚠️ **`scripts/tests/docs.test.mjs:28` fails `npm test` if any `docs/*.md` contains the string `npm run <script>` for a script that does not exist.** Its regex is `/npm run ([a-z0-9:-]+)/g`. **This document therefore never writes the two words `npm run` in front of `test:delivery`** — the script does not exist yet. When the script lands, that constraint disappears; until then, referring to it by name alone is safe and writing the prefix is not.

Four edits, all of which must land together:

1. `package.json` — `"test:delivery": "node --test --test-concurrency=1 scripts/tests/delivery.test.mjs"`. Sequential because it boots a Worker and a local D1.
2. `package.json` — insert `test:delivery` into the `test` chain, between `test:compatibility` and `test:api`. **A suite not in the chain is a suite that does not run.**
3. `scripts/tests/delivery.test.mjs` — boot only, copied from `api-edge.test.mjs:1-34`, plus the `sql` helper from `api.test.mjs:45-48` (api-edge has no such helper and inlines `d1 execute`, which is unusable for the structural assertions below).
4. `scripts/tests/unit.test.mjs` — **two export lines appended to the esbuild stdin template, after line 29, not after line 40.** The `contents:` template literal runs `:17-29`; `:35-37` is the build config and `:40` is `test.after(...)`. Appending at `:40` puts an `export … from` statement inside a JS call and kills the *bundle*, taking all ~60 unit tests with it — a failure that looks like sixty broken tests and is one misplaced line.

```js
export { normalisePostcode, sumOpeningAreaM2, zoneIsPriced, resolveZone, deliveryCost } from ${p("worker/lib/delivery.ts")};
```

The same commit creates `worker/lib/delivery.ts` with signatures that **throw** — not `return 0`. A stub returning zero makes T-A1 pass for the wrong reason, and a green test that has never run the code it names is worse than no test.

*Verify:* `npm run test:unit` passes unchanged; the delivery suite boots and hits `/api/health`; `npm run test:docs` passes with this file in the tree.

### 10.1 Pure unit tests — `scripts/tests/unit.test.mjs`

Fixtures under the existing ones at `:43-44`. **Every zone referenced by a range must be present in `ZONES`** — an earlier draft's fixture referenced `tas` and `tas-remote` from `RANGES` while omitting them from `ZONES`, so five tests asserted on a zone that could not be returned.

```js
// 45 / 180 / 900 is a SHAPE, not the owner's rates — it puts the break-even at
// exactly 4 m² and the cap at exactly 20 m², so a failure names the band it broke.
const VIC_METRO = { id:"vic-metro", ratePerSqm:45, minCharge:180, maxCharge:900, isFallback:0 };
const VIC_REGIONAL = { id:"vic-regional", ratePerSqm:70, minCharge:260, maxCharge:1400, isFallback:0 };
const TAS = { id:"tas", ratePerSqm:100, minCharge:560, maxCharge:2100, isFallback:0 };
const TAS_REMOTE = { id:"tas-remote", ratePerSqm:180, minCharge:900, maxCharge:4000, isFallback:0 };
const UNMAPPED = { id:"unmapped", ratePerSqm:220, minCharge:980, maxCharge:4200, isFallback:1 };
const ZONES = [VIC_METRO, VIC_REGIONAL, TAS, TAS_REMOTE, UNMAPPED];
const RANGES = [
  { zoneId:"vic-metro", from:3000, to:3207 }, { zoneId:"vic-regional", from:3211, to:3996 },
  { zoneId:"tas", from:7000, to:7999 },       { zoneId:"tas-remote", from:7255, to:7256 },
];
```

**The rate curve**

| # | Test name | Assertion |
|---|---|---|
| **T-A1** | *"zero area is charged the zone minimum, because a minimum charge is a floor"* | `deliveryCost(0, VIC_METRO) === 180` — the locked formula applied literally, no short-circuit |
| **T-A2** | *"one 600 × 600 window still costs the zone minimum"* | area `0.36`; cost `180` (16.20 raw, floored). **This is the test that proves the floor is a floor** — with a base it would cost `180 + 16.20` |
| **T-A3** | *"an area under the break-even is charged the minimum, not the arithmetic"* | `deliveryCost(3, VIC_METRO) === 180` (135 raw) |
| **T-A4** | *"the minimum and the linear band meet without a step at the break-even"* | `4 → 180`; `4.5 → 200` (202.50 → 200) |
| **T-A5** | *"between the floor and the cap the charge is area × rate, rounded to the $10 grid"* | `10 → 450`; `19 → 860` (855 → 860); `4.32 → 190` (194.40 → 190) |
| **T-A6** | *"the area landing exactly on the cap is charged the cap"* | `20 → 900` |
| **T-A7** | *"clamping happens before rounding, so the answer is always on the $10 grid"* | `19.999 → 900`; and `deliveryCost(x, Z) % 10 === 0` for a sweep of x. **This is what keeps deposit == balance** (§5.1) |
| **T-A8** | *"ten times the glass does not cost ten times the delivery — the cap holds"* | `60 → 900`; `200 → 900`. The owner's sentence as an assertion |
| **T-A9** | *"a zone whose rate is zero still charges its minimum"* | `deliveryCost(10, {…, ratePerSqm:0}) === 180` |
| **T-A10** | *"a maximum below the minimum is a typo, and the LOWER number wins"* | `deliveryCost(1, {…, minCharge:900, maxCharge:400}) === 400`. Unreachable in D1 (`CHECK`); defined here so a hand-built zone can never produce an unbounded charge |
| **T-A11** | *"more glass never costs less to deliver"* | sweep `0 → 80` in 0.17 steps: monotonic, finite, never above `maxCharge`. One loop that catches an inverted clamp, a NaN leak and a cap breach |
| **T-A12** | *"a negative or non-finite area is refused rather than credited"* | `-5`, `NaN`, `±Infinity` → `0` |

**The postcode**

| # | Test name | Assertion |
|---|---|---|
| **T-A13** | *"a four-digit postcode maps to its zone"* | `normalisePostcode("3000") === "3000"`; resolves `vic-metro`, `basis === "postcode_zone"` |
| **T-A14** | *"0800 is a postcode, not the number 800 — the leading zero survives, and a number is not a postcode"* | `normalisePostcode("0800") === "0800"`; `normalisePostcode(800) === null`; `normalisePostcode(3000) === null` |
| **T-A15** | *"range bounds are inclusive at both ends"* | `3207 → vic-metro`; `3211 → vic-regional`; `3208` (the gap) → fallback, **not** the nearer neighbour |
| **T-A16** | *"surrounding whitespace is not a malformed postcode"* | `" 3000 "`, `"\t3000\n"` → `"3000"` |
| **T-A17** | *"anything that is not exactly four ASCII digits is refused"* | `"300"`, `"30000"`, `"3o00"`, `"3 00"`, `"VIC 3000"`, `""`, `"3000.0"`, `"+3000"`, `"٣٠٠٠"`, `null`, `undefined`, `{}`, `[]`, `true`, `3000`. **`"٣٠٠٠"` is deliberate**: `/^\d{4}$/` rejects Arabic-Indic digits and `/^\p{Nd}{4}$/u` accepts them; this test fixes which one it is |
| **T-A18** | *"a postcode inside no configured range still gets a zone — never nothing"* | `"9999"`, `"0000"`, `"3208"` → a non-null zone, `isFallback`, `basis === "fallback_zone"`. D9 as an assertion; the function has no `null` branch to forget |
| **T-A19** | *"overlapping ranges resolve to the narrower one, not to whichever was written first"* | `"7256" → tas-remote`; `"7100" → tas`; **and the same two assertions against `[...RANGES].reverse()`**. The reversal is the assertion: row order must not change a price |
| **T-A20** | *"an unpriced zone is not free delivery — it falls to the fallback"* | `TAS` with NULL rates: `"7100"` → `unmapped`. The owner is guessing rates, so a half-populated table is the expected state |
| **T-A21** | *"an inactive zone falls back rather than continuing to price"* | `TAS` with `active: 0` → `unmapped` |

**The area basis**

| # | Test name | Assertion |
|---|---|---|
| **T-A22** | *"millimetres in, square metres out, from string dims and numeric dims alike"* | `{width:"1200",height:"900"} → 1.08`; `{width:1200,height:900} → 1.08`. Both shapes are in the database (§5.2) |
| **T-A23** | *"a composite opening is measured once — its units are frames of one hole, not extra deliveries"* | parent 3600×2400 + two 1800×2400 segments → `8.64`, and `assert.notEqual(…, 17.28)`. The `notEqual` stays: 17.28 is the exact number the bug produces, which makes the failure message diagnostic |
| **T-A24** | *"the area basis is parents-only, exactly as every money total in this system is"* | a mixed set → the parents-only sum |
| **T-A25** | *"an opening ordered three times ships three frames, and qty 0 is clamped to 1"* | `2400×1800 ×3 → 12.96`; `qty 0 → 4.32` |
| **T-A26** | *"a line with no readable dimensions contributes nothing and does not poison the total with NaN"* | junk dims + one good line → finite, `1.08`, `unmeasuredLines === 3` |

**The deposit**

| # | Test name | Assertion |
|---|---|---|
| **T-A27** | *"there is one deposit percentage in this codebase and it is 50"* | `DEPOSIT_PERCENT === 50`. Already exported into the unit bundle at `unit.test.mjs:25` |
| **T-A28** | *"deposit and balance are computed once, over goods plus delivery"* | `depositOf(10000, 640) === 5320`; `balanceOf(10000, 640) === 5320`; `depositOf(10000, 0) === 5000` |
| **T-A29** | *"deposit and balance add up to the total, to the cent"* | for every `(goods, delivery)` pair in a grid: `deposit + balance === total`. Given T-A7 the split is always even, and this is the test that fails loudly if T-A7 is ever relaxed |

**The builder guard**

| # | Test name | Assertion |
|---|---|---|
| **T-A30** | *"the customer's running estimate has no delivery term, and cannot grow one"* | `quoteSummary({items, files})` with a delivery-shaped extra key present on the state → the total equals `Σ linePriceTotal` exactly. **This replaces an earlier draft's test that asserted `draft_total === Σ line_total`, which is true by construction** (`draft_total` is a SQL sum over `quote_line`, and delivery is never a `quote_line`) **and therefore could not fail.** D8 is a promise about the browser, so the guard must be on the browser's function |

### 10.2 API tests — `scripts/tests/delivery.test.mjs`

One Worker, one migrated-and-seeded local D1, many `t.test` subtests, sequential. Subtests share the database, so **every test that edits the zone table creates its own zone over the unused `9800–9899` block and deletes it** — the same self-containment the rate-card E2E already practises.

**Setup:** the seeded zones have NULL rates, so the suite's first act is to price four of them through E3 (`vic-metro`, `vic-regional`, `nt`, `unmapped`) with the fixture shape from §10.1. That is also the first proof the write endpoint works.

**The postcode reaches the server**

| # | Test name | What it asserts |
|---|---|---|
| **T-B1** | *"a submission with no delivery postcode is refused, and the project stays a draft"* | 400 `missing_postcode`, **and** `status_customer` is still `draft`. The state assertion matters as much as the code: `quote.ts:196-242` is one conditional UPDATE, and a validation added after it would 400 an already-submitted project |
| **T-B2** | *"a postcode that is not four digits is refused, distinctly from a missing one"* | `"300"`, `"30000"`, `"3o00"`, `"VIC 3000"` → 400 `invalid_postcode` |
| **T-B3** | *"a valid postcode is stored digits-intact, and the free-text suburb is left alone"* | `"0800"` stored as `"0800"`; `delivery_suburb` unchanged |
| **T-B4** | *"the submit-screen preview prices a postcode without committing anything"* | E9 returns a number; `project.delivery_postcode` still NULL; `"30"` → 400 |
| **T-B5** | *"the preview endpoint refuses a project the caller does not own"* | 404/403 for a foreign project id |

**The estimate**

| # | Test name | What it asserts |
|---|---|---|
| **T-B6** | *"submitting records the postcode; the ops record prices it live"* | `delivery.estimate > 0`, `delivery.zoneId === "vic-metro"`, `delivery.amount === null`, `delivery.settled === false` |
| **T-B7** | *"a postcode we do not price still gets a number, and admits it is a fallback"* | `"9999"` → `estimate > 0`, `basis === "fallback_zone"`, `zoneId === "unmapped"` |
| **T-B8** | *"the account discount moves goods and never delivery"* | identical lines, identical postcode, anonymous vs. the seeded 5% account: goods **differ**, `delivery.estimate` **byte-identical**. The regression that catches someone later "helpfully" threading `ownerUserId` through the resolver |
| **T-B9** | *"a line change moves the machine estimate and never the settled figure"* | settle at 640, then `POST /api/ops/lines/:id/split` — `delivery.estimate` moves, `delivery.amount` is still 640. **Driven through split, not through the qty PATCH**: the PATCH is the one mutation of seven that bumps `quote_edit_version` and therefore the one least likely to expose a staleness bug |

**The staff figure**

| # | Test name | What it asserts |
|---|---|---|
| **T-B10** | *"staff replace the machine estimate with the real number, and both survive"* | `amount === 640`; `settledEstimate` equals the pre-override estimate; `settled === true` |
| **T-B11** | *"the override is logged with both numbers"* | exactly one `audit_event` row matching `%delivery%`, containing both figures |
| **T-B12** | *"a negative delivery charge is a typo that pays the customer"* | `-50` → 400; `"lots"` → 400; anonymous caller → 403 |
| **T-B13** | *"delivery cannot be edited once the quote is issued"* | after issue, E7 → 409 `locked` |

**The gate**

| # | Test name | What it asserts |
|---|---|---|
| **T-B14** | *"a quote cannot be issued until delivery is settled"* | the `issue-revision` action is **present and blocked** with a `/delivery/i` reason; the route returns 409 `delivery_unset`; **zero `quote_revision` rows exist**. Both halves: the console shows it blocked, and the Worker refuses anyway |
| **T-B15** | *"the second issue endpoint is gated too"* | `POST /api/projects/:id/issue-revision` (`worker/routes/quote.ts:299`) → 409 `delivery_unset`. **On `submitted` and `triage_pending` — both in `ISSUABLE_FROM` — `actionsFor` renders no issue button at all, so the server guard is the whole mechanism** |
| **T-B16** | *"an explicit zero is settled — a trade customer is not an unfinished quote"* | `amount: 0` → `blockedReason` undefined, `settled === true`, issue succeeds, `quote_revision.delivery_total === 0`. **`0` and `NULL` are two states and the whole gate rests on the difference; a truthiness check anywhere fails exactly this test and nothing else** |
| **T-B17** | *"un-setting re-arms the gate"* | `amount: null` after settling → blocked again |
| **T-B18** | *"requesting changes re-arms the gate for the next revision"* | issue R1 at 640; `request-changes`; assert `delivery_amount IS NULL` and the issue action blocked again. Without this the gate is armed once per project, ever |
| **T-B19** | *"replying to a clarification re-arms the gate"* | same, via `clarification-reply` |

**The freeze**

| # | Test name | What it asserts |
|---|---|---|
| **T-B20** | *"issuing freezes the figure and the basis it was priced from"* | `total === goods + 640`; `quote_revision.delivery_total === 640`; `totals_json` deep-equals `{total, goods, delivery, deliveryPostcode, deliveryZoneId, deliveryAreaM2}` |
| **T-B21** | *"re-issuing freezes the current figure; the superseded revision keeps its own"* | R1 → 640, R2 → 700, R1 `snapshot_status === 'superseded'`, both `delivery_total`s intact |
| **T-B22** | *"editing the rate table does not move a quote that is already issued"* | quadruple the zone rate after issue, then assert through **`GET /api/projects/:id/revisions`** — the customer read path, which is where a lazy implementation would recompute. Asserting only on the D1 column cannot fail |

**The order — the seam this feature dies at**

| # | Test name | What it asserts |
|---|---|---|
| **T-B23** | **THE CRITICAL ONE** — *"the order total includes delivery: orders.ts re-derives from the lines and must not lose it"* | five assertions, so the failure names which half broke: `Σ order_line === goods`; `"order".delivery_total === 640`; `"order".total === goods + 640`; `"order".total === totals_json.total`; the DTO's `order.total` agrees with the row. `worker/lib/orders.ts:141` never reads `totals_json` — **this test is the reason the plan exists** |
| **T-B24** | *"the deposit is half of goods plus delivery"* | `percent === 50`; `amount === round((goods+640) × 0.5)`; and two `notEqual`s naming the two wrong answers — half of goods alone, and 40% of the right total |
| **T-B25** | *"deposit and balance add up to the order total, to the cent"* | on a real minimum-charge one-window order, not a synthetic figure: `dep + bal === total`, **and both `payment.percent` values are 50** — so whoever relaxes the $10 grid has to look at `RecordDetailPage.tsx:297-304` |
| **T-B26** | *"delivery is never a line — not a quote_line, not a revision_line, not an order_line"* | row counts on all three tables equal the opening count; no `product_slug` matching `%deliver%`/`%freight%`; `DISTINCT line_kind` is `['simple']` |
| **T-B27** | *"a project quoted before this feature still works"* | insert a `quote_revision` with the one-key `totals_json = '{"total":10000}'` and `delivery_total = 0`; accept it; `"order".total === 10000`, deposit `5000`; and `/revisions` returns `goods: 10000, delivery: 0` — the `?? 0` / `?? total` defaulting of §6.7, currently untested anywhere |
| **T-B28** | *"delivery is GST-inclusive everywhere and is never grossed up on the way to a screen"* | the same 640 appears on the ops DTO, the customer revision DTO and the order DTO |

**The zone table**

| # | Test name | What it asserts |
|---|---|---|
| **T-B29** | *"a delivery zone is created, priced, renamed and deleted"* | create → 200; duplicate → 409 `id_taken`; save → version bumps; stale `expectedVersion` → 409 `version_conflict`; delete → 200 then 404; `unmapped` delete → 400 `cannot_delete_fallback`; every GET carries `canEdit`; anonymous → 403 |
| **T-B30** | *"a rate that pays the customer is refused, and so is a cap under a floor"* | `ratePerSqm: -1`, `minCharge: -1`, `maxCharge: -1` → 400 `invalid_amount`; `{min:900, max:400}` → 400 `max_below_min` |
| **T-B31** | *"a postcode range runs forwards, inside the allocated space"* | `{from:"abc"}`, `{from:100}`, `{to:10000}` → 400 `invalid_range`; `{from:3999,to:3000}` → 400 |
| **T-B32** | *"a partially overlapping range is refused; a fully contained one is not"* | `3100–3300` against an existing `3000–3207` → 409 `range_overlap`; `3050–3060` inside it → 200 |
| **T-B33** | *"the seeded table covers the country and names exactly one fallback"* | ≥ 12 active zones; exactly one `is_fallback`; **no partial overlaps** in the seed (containment permitted, partial refused, by the pairwise SQL of §6.2); and `"3000"`, `"2000"`, `"4000"`, `"5000"`, `"6000"`, `"7000"`, `"0800"`, `"2600"` all resolve with `basis === "postcode_zone"` once priced — no capital city falls through |
| **T-B34** | *"the fallback is the dearest zone in the table"* | at 1 m² **and** at 30 m²: the fallback's cost ≥ every other priced zone's. Both ends, because a zone can be dearest per m² and cheapest at the floor |

### 10.3 Playwright — `scripts/tests/web/`

`workers: 1`, `fullyParallel: false`, one shared Worker and D1. Role and label selectors only — this repo has no test ids. `staffLogin` reused verbatim from `ops.spec.ts:23-32`; `mockProject` from `quote-project.spec.ts:29`.

> **`getByLabel` does not work on the customer forms today.** `FieldLabel` has no `htmlFor`, `Input` takes no `id`, and the label is a sibling rather than a wrapper — so there is no accessible name to query. The `ui.tsx` change in §8.2 is a **prerequisite** for T-C2 through T-C5, not a nice-to-have. The ops selectors are fine as-is because `Pricing.tsx:493` wraps its input inside the label.

| # | Spec | Test name | What it drives |
|---|---|---|---|
| **T-C1** | `quote-project.spec.ts` | *"the builder shows no delivery — the figure belongs to submission, not to browsing"* | the sticky summary region contains no `/deliver/i` and no `/freight/i` |
| **T-C2** | `quote-project.spec.ts` | *"the submit screen asks for a postcode and will not submit without four digits"* | CTA disabled with name+email alone; `"30"` shows the field-level error; `"3072"` enables it |
| **T-C3** | `quote-project.spec.ts` | *"entering a postcode prices the delivery and moves the project total"* | a Delivery row appears; `Project total` equals goods + delivery, inc GST **(gated on Q1)** |
| **T-C4** | `quote-project.spec.ts` | *"a postcode we do not price still shows a number, and says a person will check it"* | `"9999"` → a `$` figure, a "we'll confirm" sentence, **and `toHaveCount(0)` on `/quoted separately\|contact us for delivery/i`** — the owner's override of the show-nothing recommendation, written as a refusal |
| **T-C5** | `customer.spec.ts` | *"the issued quote asks for half of goods plus delivery"* | fixtures built through `page.request` against the ops API; a Delivery row is visible; deposit `=== total / 2`; `total === goods + 640`; no `/40%/` anywhere |
| **T-C6** | `ops.spec.ts` | *"the record shows the machine estimate beside the number staff confirmed"* | Delivery block visible with the zone label, the postcode and an "Estimated" figure; "Not set" while unsettled |
| **T-C7** | `ops.spec.ts` | *"Issue reviewed quote is blocked, and says delivery is why"* | button visible, disabled, with a `/delivery/i` sentence beside it |
| **T-C8** | `ops.spec.ts` | *"a staff override settles delivery, unblocks issuing, and the issued total carries it"* | save 640; **the estimate is still on screen**; the button enables; issue; the header reads goods + 640 |
| **T-C9** | `ops.spec.ts` | *"a delivery zone can be created, priced, saved and deleted from the console"* | on a `e2e-zone-${Date.now()}` zone it creates and destroys. The `0 → 1200` first-time edit is deliberately the shape that armed the removed rate-card tripwire; a zones screen copied from `RateCardDetail` inherits whatever gate that pattern carries |
| **T-C10** | `how-it-works.spec.ts` | *"the promise is tailgate to kerbside, and the old door-to-door claim is gone"* | `toHaveCount(0)` on both `"Door-to-door, from our factory to your site"` and `"We hand over at your address"`; `/kerb/i` visible on both pages. **A test rather than a checklist item, because a release that ships the fee without the copy charges for a service it no longer describes** |

### 10.4 What these tests deliberately do not cover

- **A carrier API.** There is none (D20). Nothing mocks a rate lookup because nothing calls one.
- **Variation invoicing.** The business absorbs overruns (D12), so there is no test for a top-up, a third `payment.kind`, or a post-acceptance adjustment.
- **Path branching.** One rate model (D4). No test distinguishes the two fulfilment paths, because no code does.
- **Customer pickup.** Dropped (D15). Verified by grep that no pickup path exists anywhere in `src/` or `worker/` to test — that check was asserted rather than run in an earlier draft, and it does hold.
- **The rate table's *values*.** T-B33/T-B34 assert its *shape* — coverage, one fallback, no partial overlap, the fallback is dearest. Never that Perth metro is a particular number.
- **Visual regression.** There is no snapshot testing in this repo and this feature is not where one is introduced.
- **Email bodies.** Flagged in Q10 instead.

---

## 11. COMMIT SEQUENCE AND ROLLOUT

Nine commits. Each builds, each passes `npm test`, each is revertible on its own, and each can sit at the head of `main` indefinitely. Only three are visible to a customer and only one moves money.

| # | Commit | Visibility | Migration |
|---|---|---|---|
| C0 | this document | dark | — |
| C1 | one deposit percentage, one place that computes it | staff-visible | `0043` |
| C2 | delivery and manufacturing copy corrected | **customer-visible**; no money | — |
| C3 | zone tables + ops zone editor | dark to customers | `0044` |
| C4 | the pure engine + its unit suite | **fully dark** — no callers | — |
| C5 | postcode captured and validated at submit | **customer-visible** | — |
| C6 | ops delivery panel, estimate beside the staff number | staff-visible | — |
| C7 | the issue gate, and re-arming on re-issue | flips **staff** behaviour | — |
| C8 | delivery enters the money | **THE FLIP** | — |
| C9 | E2E, copy tests, comment tidy-up | dark | — |

**C1** — §4.3 in full, plus the two browser deposit computations deleted. First and alone, because reconciling four deposit implementations *after* `total` changes meaning means changing four numbers that were never the same number, in a change where the answer is money.
*Verify:* the estimator preview, the review screen and the payment rows quote the same deposit on the same job; `PUT /api/ops/pricing/policy` is gone; T-A27/T-A28/T-A29 green.

**C2** — the four strings of §9. Ships today, alone, ahead of everything. The copy is false **now**, not merely false after the pricing lands. Placing it first means D18's "same release" is satisfied by construction and cannot be lost if C8 slips: copy can precede a charge, never follow it.
*Verify:* T-C10 green.

**C3** — `0044`, the zone CRUD, the sub-tab. **Includes widening the `applyPricingChange` table union** (§6.1) — without it `npm run typecheck:gate` fails and nothing else in the commit matters. Seeds zone rows and ranges, **no rates**.
*Verify:* T-B29 through T-B33 green; the console lists fifteen zones, four of them showing "not priced".

**C4** — `worker/lib/delivery.ts`, `round10` exported from `pricing.ts`, the whole of §10.1. Zero callers, zero routes. This is the commit that can sit unmerged for a week and the one where the arithmetic gets argued about cheaply.
*Verify:* T-A1 through T-A30 green; nothing else in the app changes behaviour.

**C5** — the submit validation, the two fields, the `ui.tsx` prerequisites, E9, **and the error-code plumbing** (§8.2) without which a three-digit postcode tells the customer to fix their item codes. First commit that can lose a submission — submissions-per-day is the metric to watch after deploy, and a drop is not a coincidence.
*Verify:* T-B1 through T-B5, T-C1 through T-C4 green.

**C6** — the DTO `delivery` key, `order.total`/`deliveryTotal` on the ops order sub-object, the rail block, E7. **E7 must accept a number for a project whose postcode is NULL** — every project submitted before C5 has none, and if the setter requires a resolved zone then the moment C7 lands every job in the queue becomes permanently unissuable.
*Verify:* T-B6 through T-B13, T-C6 green.

**C7** — GUARD 8, the `blockedReason`, the `ACTION_ERRORS` key, the re-arm in `request-changes` and `clarification-reply`. **Must land before C8.** If the money commit goes first, an unsettled delivery is NULL, NULL contributes nothing, and quotes go out at goods-only prices that look correct on every screen. The gate turns "we forgot" into a refusal rather than into an absorbed cost.
*Verify:* T-B14 through T-B19, T-C7 green.

**C8 — THE FLIP.** `revisions.ts` totals and `totals_json`; `orders.ts:141`; the customer totals rows; the ops header. **Checklist item: grep `scripts/tests/api.test.mjs` for any assertion that a header total equals the sum of its lines and delete it** (§4.2) — that assertion now says delivery does not exist.
*Verify:* T-B20 through T-B28, T-C5, T-C8 green.

**C9** — T-C9, the `Pricing.tsx:10-14` comment rewrite, and the stale ±20% tripwire comment at `worker/routes/ops-pricing.ts:33-36`, which has been wrong since 2026-08-13.

### 11.1 Can this ship dark? Yes.

Six of the nine commits are invisible to customers; C1 changes a number only staff saw. That leaves C2 (copy, no money) and C5 (a required field) before C8, the only commit that changes a price. The rate table can be built, filled, corrected and refilled in production for as long as the owner wants before anything is charged.

**One gate before the customer-facing figure goes live:** the fallback zone must be priced (§13). Until it is, C5's figure resolves to `unpriced_table` and the submit screen shows no number — which contradicts D9 and is therefore a **release-checklist item, not a runtime behaviour**: C5 does not deploy until three numbers are in the table.

### 11.2 Deploy order, and the lesson not to repeat

`npm run cf:deploy` and `npm run db:migrate:remote` are two authenticated commands run by a human. Nothing sequences them.

On 2026-08-13 `0042_drop_pricing_change.sql` dropped a table while the deployed Worker still wrote to it. The update succeeded and the audit insert threw, so every pricing save returned 500 **after having already written the customer-visible change** — the operator saw a failure, retried, and wrote it again over a system telling them nothing had happened. The migration was correct; the deploy that made it safe had not run yet.

Two rules, and `migrations/0037_drop_measured_by.sql` already states the first in its own deploy note:

> **Rule 1 — Additive migrations run BEFORE the deploy. Destructive migrations run AFTER the deploy is confirmed live. A release never contains both.**

`0044` is entirely additive: two `CREATE TABLE`s and eight `ALTER TABLE … ADD COLUMN`s. It migrates first and every intermediate state is valid. `0043` is destructive (`DROP COLUMN`) and therefore runs **after** C1's code is live and confirmed — the code stops reading `deposit_percent` first, and the drop is cleanup. **They are separate releases**, which is the whole point of C1 being its own commit.

> **Rule 2 — Order the statements so a missing-schema failure happens before anything durable is written.** A 500 on a read is an error screen; a 500 after a successful write is a lie.

All three delivery paths satisfy it: the zone screen fails on its first `SELECT`; the submit write is one conditional batch, so a missing column leaves the project a draft; and the issue path's GUARD 6 (`revisions.ts:214-222`) already converts a batch throw into a 409, so a missing `delivery_total` degrades to *"this quote cannot be issued right now"* rather than to a quote issued at the wrong number.

### 11.3 Rollback

`wrangler rollback` does not roll back D1. A code-only rollback is safe for every commit except **C8**:

> Reverting C8 restores `orders.ts:141` to a line-sum. Any revision issued in the window carries a delivery-inclusive `totals_json.total`, and any order created from one of those revisions **after** the rollback is short by exactly the delivery amount. Bounded, and one query finds them:
> ```sql
> SELECT o.order_no FROM "order" o JOIN quote_revision r ON r.id = o.accepted_revision_id
>  WHERE o.created_at > '<rollback time>' AND json_extract(r.totals_json,'$.delivery') > 0;
> ```
> Run it before deciding the rollback is finished.

### 11.4 If the scope narrows

Ship **C1, C2, C3 (one zone), C5, C6, C7, C8**. Skip C4 as a separate commit and reduce C3's seed to a single zone whose range is `0200–9999`, priced with the owner's one conservative set of numbers.

Every seam exists, every route is real, D9 holds with one row exactly as with fifteen, and the only thing deferred is data entry — which is the part the owner is not ready for. Splitting one row into fifteen later is an afternoon in the ops screen and touches no code. C4 becomes trivial with one zone but the tests still get written: they are the specification of the formula.

What this defers honestly: zone-accurate pricing. Metro Melbourne subsidises Darwin until the table is filled, and staff correct both at review. That is worse pricing than the full design and considerably better than the current position, which is that the delivery cost is invisible and the business pays all of it.

**C1, C2 and C7 are not cuttable.** Cutting C1 relocates the work to the week after two deposits disagree on a customer's screen. C2 is two strings correcting a claim that is false today. Without C7, delivery is a field staff can forget, and a forgotten field prices delivery at zero — the status quo, now with a screen implying otherwise.

---

## 12. RISKS

**1. `worker/lib/orders.ts:141` drops the charge, and nothing anywhere says so.**
The order total is re-derived from `revision_line` and `totals_json` is never read. Delivery is a project-level charge with no line. If C8 changes the revision and not the order, the customer accepts $18,400, the order records $17,950, both invoices are computed from the wrong number, and **every screen is internally consistent** — the contract total reads `order.total`, the payments read `payment.amount`, and all of them agree with each other and disagree with the document the customer accepted. Nothing throws. It surfaces when someone reconciles a bank statement.
*Mitigation:* the failure is silent, so the guard is a test, not a review. **T-B23**, five assertions in one subtest so the failure message names which half broke.

**2. The deposit divergence becomes a number on a customer document.**
Two browser sites compute `Math.round(total / 2)` from `totals_json.total`; the server computes it from the order total. The moment those two totals differ — which is exactly risk 1 — the review screen and the invoice quote different deposits on documents the customer has both of.
*Mitigation:* C1, shipped first and alone. After it the deposit exists in one server expression and there is no second implementation left to forget.

**3. An owner-guessed rate is badly wrong on a remote destination, and the business eats it.**
D12 fixes the issued figure and D20 says the owner is guessing. One Alice Springs job with a $2,400 real cost against a $700 estimate is a $1,700 loss the business has contractually agreed to take, and it will happen on one of the first ten remote jobs because the first ten are how the owner learns the number.
*Mitigation:* three, in ascending order of how much they help. (a) The per-zone cap is also the largest single under-recovery, so the remote caps are the numbers to set deliberately high first and tune down. (b) D19's beside-comparison, with `delivery_settle_json` recording the area and the zone version, so twenty overrides *are* the rate table. (c) **The staff number always wins.** The estimate never issues itself — a bad rate produces a bad *suggestion*, and the loss requires a human to accept it. (c) is the one that actually holds in the first month, and it is why the gate is not optional.

**4. Delivery is a large fraction of a cheap order.**
`min_charge` is a floor (D5). One 900×1200 awning at $780 into a regional zone with a $450 floor is a 58% surcharge. Not a pricing error — that pallet really does cost that to move — but it reads as one, and it will lose small jobs the business may or may not want to lose. D8's hide-it-while-building makes it worse if it is also hidden at submit.
*Mitigation, partial:* the ops panel shows the estimate as a percentage of goods, so the calls worth making announce themselves. And Q1: showing the figure at submit means the surcharge is disclosed *before* commitment rather than after. The rest is a commercial question — see **Q4**.

**5. The copy promises a service that is not delivered.**
"Door-to-door, from our factory to your site" and "We hand over at your address" describe an Australian factory and a hand-over that includes unloading. Neither exists. Charging against that description converts a marketing inaccuracy into a paid representation: a customer who has paid $650 for "door-to-door" and finds a driver on a tailgate expecting them to unload 300 kg of glass has a complaint that is now about money.
*Mitigation:* C2, shipped first and independently, plus **T-C10** so a later edit cannot quietly restore it. And the figure carries its own sentence at the point it is shown, not only on a page the customer may not revisit.

**6. A four-digit postcode is valid and wrong.**
`3070` (Northcote, metro) and `3730` (regional) are one keystroke apart in different zones with materially different rates. Four-digit validation cannot detect a typo that is also a postcode.
*Mitigation:* the ops panel shows the **zone label and the free-text suburb together** — `3730 · Victoria regional` next to the word "Preston" is a visible contradiction a staffer resolves with a phone call. This is the one place `delivery_suburb` earns its keep, which is why §4.4a keeps it rather than replacing it.

**7. A mis-keyed `0` is indistinguishable from a deliberate waiver.**
D11 makes `0` settled and D14 relies on it. A staffer who tabs through and types a zero produces a quote that passes the gate and charges nothing, looking exactly like a trade waiver.
*Mitigation:* E7 treats `0` as a distinct choice — a confirm on `0` specifically, in the pattern of `ops-actions.ts`'s `confirm` string, since the console already confirms in place for anything that moves money. It does not prevent the mistake; it makes it require a second deliberate act.

**8. The rates move while a staffer is looking at the screen.**
The estimate is live by design. A staffer sees $620, is called away, the owner corrects the regional rate, and they return to $840 with no indication anything changed.
*Mitigation:* the panel prints the zone's `updated_at` beside the estimate, as the rate-card detail already does. Once a number is settled, the settled number is what the gate reads; the estimate beside it moving is the point.

**9. Ex-GST rates typed into GST-inclusive fields.**
Carrier invoices are commonly ex-GST; the owner types thirty-six numbers by hand. A `$900` cap typed from a `$900 ex-GST` quote under-recovers 10% on every capped job, silently, forever.
*Mitigation:* the zone editor shows the ex-GST equivalent live beside each field (§5.6). One derived number; the mistake becomes visible at the moment it is made.

**10. The review queue stops the day this ships.**
Every project already submitted has both delivery columns NULL and cannot be issued until a staffer types a number.
*Mitigation:* §4.5 — the count is knowable a week ahead with one query, the free-text suburb is on the panel to read the postcode out of, and the fix per job is one field.

---

## 13. WHAT THE OWNER MUST SUPPLY

The code ships with none of this. The rates do not. Until the table is filled, every zone resolves to the conservative fallback, which is deliberately high — the failure mode of an incomplete table is an overcharge a human sees and corrects at review, never an undercharge nobody sees.

**BLOCKING — three numbers, without which the customer-facing commit does not deploy (§11.1):**

- [ ] **The fallback zone's minimum charge, $/m² rate and maximum cap.** This is the number every unmapped, remote and not-yet-priced postcode uses, so on day one it is what most customers see. D9 requires a figure and this document will not invent one.

**Required before the table means anything:**

- [ ] **Three numbers per zone — thirty-six in total.** Minimum charge, dollars per square metre, maximum cap. All **GST-inclusive** (D16). A zone missing any one of the three stays on the fallback and says so in the console.
- [ ] **The sanity pair, per zone**, if deriving thirty-six numbers cold is unappealing: what would the business charge to deliver **one 1.2 m² window**, and what would it charge for **twenty windows totalling 30 m²**? Those two answers are the floor and the cap; the $/m² rate is what joins them. Less work than inventing three numbers, and easier to argue with.
- [ ] **Five to ten real domestic delivery invoices** from the last six months, each with the destination postcode, the total square metres of glass, **and which fulfilment path it came off** — direct-from-overseas or via-warehouse. The path label is not optional: §2.1 calibrates from the dearer path, and without it the owner will calibrate against whichever invoices are to hand and systematically under-recover on the other.
- [ ] **Confirmation that the cap is per QUOTE**, not per consignment and not per pallet. That is what the formula computes.

**Confirmations:**

- [ ] The metro/regional boundaries seeded in §4.6 — see **Q5**.
- [ ] Whether ACT is its own zone — **Q6**.
- [ ] The answer to **Q1** (does the customer see a figure at submit).
- [ ] Sign-off on the four copy strings in §9, including 9.4, and on the one-line note beside the delivery figure on the quote.
- [ ] **A named person who owns the table.** Access is flat — every staff identity admitted by the Access policy can edit these numbers, there is no approval step, and `0042` removed the change history. That is a deliberate decision, not an oversight, and it means the control is knowing who is doing it.

---

## 14. OPEN QUESTIONS

None of these blocks C0–C4. Q1 blocks C5's final shape; Q2 and Q3 block nothing but should be answered before C8.

**Q1 — Does the customer see a delivery figure on the submit screen?**
(a) Yes — a Delivery row and a project total, once four digits are entered, labelled as an estimate a person will check. (b) No number until the reviewed quote; the screen says only that delivery is priced from the postcode. (c) A number, but no project total — the delivery figure alone.
→ **Recommend (a).** D8 calls this "the standard e-commerce model", and that model shows shipping at checkout; D9 requires a number rather than nothing, which needs a customer surface to be meaningful; and the small-order surcharge (risk 4) is far better disclosed before commitment than after. **But D8's stated reasons are about the builder, and extending them to the submit step is an interpretation, not a locked decision.** This is the owner's call and it changes exactly one commit.

**Q2 — What is the conservative fallback number?**
D9 fixes that a number is always shown. It does not say what the number is, and this is the number every unmapped postcode uses.
(a) The owner names three figures directly — treated like any other zone, just deliberately high. (b) Derived as the dearest priced zone's formula multiplied by a stated factor. (c) A flat figure per project, ignoring area.
→ **Recommend (a).** (b) is not conservative for a genuinely remote destination, which is the case it exists for. (c) is wildly high on a one-window job and low on a twenty-window one. **This is the blocking item in §13** and the mechanism should not be chosen for the owner.

**Q3 — Does the customer see the figure change between submitted and issued?**
If staff correct $250 to $340, the pending record showed one number and the issued quote shows another.
(a) Show the staff figure the moment it is set, so the record is always current. (b) Freeze the customer view at the first machine estimate until issue, so it never moves before the document arrives.
→ **Recommend (a).** A number that moves once, upward, before anything is owed is a correction; a number that is stale for four days and then jumps at the moment of decision is a surprise at the worst possible point. A customer-experience judgement, not a technical one.

**Q4 — Is there a floor below which the business would rather not quote?**
Risk 4's case: a $780 order carrying a $450 delivery charge. That may be a job worth taking, a job worth declining, or a job worth a phone call. Nothing in the locked decisions addresses it and the software does not need to — but the answer changes whether the quote should say anything extra, and the owner should know the case exists before the first one arrives.

**Q5 — The metro fringe.** Each of these is one row's `zone_id`, and each is a real commercial call:
Gold Coast `4208–4230` seeded **metro**. Sunshine Coast `4550–4575`, Geelong `3211–3220`, Ballarat `3350–3357`, Newcastle `2280–2310`, Central Coast `2250–2263`, Wollongong `2500–2530`, Mandurah `6210` all seeded **regional**. And within Melbourne metro, the `3750–3810` growth-corridor band reaches Healesville `3777` and Warburton `3799`, an hour past Lilydale.

**Q6 — Is ACT its own zone?** Seeded separately. Collapsing it into `nsw-regional` is two `UPDATE`s and no deploy.

**Q7 — Should a PO-box postcode be flagged to staff as an undeliverable address?** It prices at the capital's metro rate (§4.6) rather than being refused, which is correct — the address problem is not a pricing problem. Whether the ops panel should additionally say *"this is a PO box"* is unanswered.

**Q8 — A project with no lines gets a delivery estimate for nothing.** `worker/routes/quote.ts:169` permits submission with zero lines when the AI job terminally failed and a clean file exists. Zero area returns the zone minimum (§5.1, the locked formula), so the customer would see *"Delivery to 3072 — around $250"* on a project with nothing in it. That is not "a postcode in an unpriced zone" and D9 was not written about it. Options: (a) suppress the customer-facing figure when the project has no priced lines, showing *"priced with your quote"* — a narrow, explicit exception to D9. (b) Show the minimum. (c) Show the minimum with a sentence saying it is provisional until the plans are read.
→ **Recommend (c).** It shows a number, which D9 requires, and it is honest about why the number is thin.

**Q9 — `src/pages/ProductsPage.tsx:41`'s sibling string, "Supply only — We manufacture and deliver."** Reviewed and judged a supply-versus-install claim rather than a location claim, so §9 leaves it. It sits one line from a string D18 does change, and the owner should confirm rather than have it assumed.

**Q10 — Does the issued-quote email mention the new charge?** `worker/routes/ops.ts:1053-1057` sends `quote_issued` with `{name, revision}` only — no total, no delivery — while the console's confirm string says the action *"emails it to the customer"*. Nothing currently tells the customer by email that a delivery charge exists.

**Q11 — Should the order record what delivery ACTUALLY cost?**
D12 makes the business absorb overruns and D20 makes the owner calibrate from invoices, but the design stores the estimate and the override and never the outcome. **`"order".delivery_actual REAL`, nullable, staff-filled when the carrier invoice lands, charges nobody and turns "are the rates right?" from memory into a query.** Without it, D19's "every override is a data point" measures the gap between one guess and another guess, not between a guess and reality.
→ **Proposed, not built.** It is a column the owner did not ask for, and adding it silently would be exactly the invention this document is meant to avoid. It is additive, has no gate, and no customer surface. **Recommend adding it**, and it is a fifteen-minute commit whenever the owner says yes.

**Q12 — Should the zone editor require min and max on the $10 grid?**
The rate term rounds to the grid after clamping (§5.1), so a cap of `$895` produces `$900` on a capped job — $5 over the typed cap. The alternative is rejecting non-grid input at the write endpoint. Currently the design accepts any value and shows the rounded worked example so the discrepancy is visible at entry. Minor, and worth one line of the owner's attention.
