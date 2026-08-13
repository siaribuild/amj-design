-- ═══════════════════════════════════════════════════════════════════════════
-- 0044_delivery_pricing — the Australian domestic delivery leg, priced.
--
-- Product prices already carry international freight, customs, duty and import
-- GST (owner, locked decision 2). What no price in this database has ever
-- carried is the leg AFTER the goods land: port cartage, warehouse handling,
-- last mile, tailgate. That cost has come out of margin on every job this
-- system has quoted, because there was nowhere to put it.
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
-- every read from the current zone table (see design doc §5.5), and what IS
-- stored is the machine's figure at the instant a human overrode it, which is
-- the thing decision 19 actually wants.
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

-- Same reasoning, plus one more: worker/lib/orders.ts re-derives the order total
-- by summing revision_line and NEVER reads totals_json. A charge held only in
-- that JSON blob would be present on the quote the customer accepted and absent
-- from the order, the deposit and the balance. This column is what the order
-- reads (wired in C8).
ALTER TABLE "order" ADD COLUMN delivery_total REAL NOT NULL DEFAULT 0;

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
  -- owner input that BLOCKS the customer-facing release (design doc §13).
  ('unmapped',     'Unmapped postcode',            1, 150);

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
  -- which are an hour past Lilydale. Owner to confirm — design doc §14 Q5.
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
