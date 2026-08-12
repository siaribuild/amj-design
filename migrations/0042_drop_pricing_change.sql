-- ═══════════════════════════════════════════════════════════════════════════
-- 0042_drop_pricing_change — remove the bespoke pricing audit trail.
--
-- pricing_change (0029) recorded the before/after of every write to the four
-- pricing tables, and backed two features in Ops → Pricing: a "Change history"
-- panel and a one-click Revert. Neither was asked for. The owner's position:
-- a bespoke history/revert mechanism should not sit beside Cloudflare's own
-- observability tooling, which is where this kind of question belongs.
--
-- The code stopped writing to, reading from, and exposing this table in the
-- same change that adds this migration — so by the time this runs, the table
-- is already inert. Dropping it is the cleanup, not the change itself.
--
-- ⚠️ THIS DESTROYS THE HISTORICAL RECORD. Every past rate/surcharge/policy
-- change — what it was, what it became, who made it, and when — is in these
-- rows and nowhere else. It is not reconstructible from the pricing tables
-- themselves, which hold only current values. If that record has any value
-- (a dispute over what a product was priced at in March, say), export it
-- before running this:
--
--   npx wrangler d1 execute apertly-db --remote --json \
--     --command "SELECT * FROM pricing_change ORDER BY created_at" > pricing_change_backup.json
--
-- The general staff activity log (audit_event) is a SEPARATE, broader system
-- covering every ops action app-wide; it is untouched here. Only pricing's own
-- duplicate trail goes.
-- ═══════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_pricing_change_row;
DROP TABLE IF EXISTS pricing_change;
