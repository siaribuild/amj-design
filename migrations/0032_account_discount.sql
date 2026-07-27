-- ═══════════════════════════════════════════════════════════════════════════
-- 0032_account_discount — a per-account discount, so a registered (trade)
-- customer gets a better price than an anonymous visitor.
--
-- Lives on the USER, not the organisation: the organisation layer is not wired
-- (memberships exist, but nothing prices against them), and inventing a second
-- place a discount could come from is how two sources of truth start. When
-- organisations become real this moves, deliberately, in its own migration.
--
-- DEFAULT 5: registering is the thing being rewarded, so every account carries
-- the trade discount unless someone sets otherwise. Existing accounts get it too
-- — that is the intent, not a side effect. An ANONYMOUS quote has no user row at
-- all, so it prices at 0% and the discount is a visible reason to sign in.
--
-- Stored as a percentage off the line total, applied after the base rate,
-- surcharges, the minimum charge and the conditional modifiers, and BEFORE the
-- $10 rounding — so a discounted total still lands on the customer-visible grid.
-- It is commercial data and never leaves the Worker except as the final number.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE user ADD COLUMN discount_percent REAL NOT NULL DEFAULT 5;

-- Staff are not customers and never price anything for themselves.
UPDATE user SET discount_percent = 0 WHERE type = 'internal';
