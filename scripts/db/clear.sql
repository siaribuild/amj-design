-- Wipe all transactional data (FK-safe order: children before parents).
-- Schema is left intact (managed by migrations). KV (sessions/OTP) is not D1 and
-- is cleared separately by the reset script when running locally.
DELETE FROM approval_step;
DELETE FROM approval_instance;
DELETE FROM approval_rule;
DELETE FROM comment;
DELETE FROM payment;
DELETE FROM order_line;
DELETE FROM file_asset;
DELETE FROM "order";
DELETE FROM quote_line;
DELETE FROM guest_grant;
DELETE FROM notification;
DELETE FROM audit_event;
DELETE FROM membership;
-- Referral program (0051), children first. `referral_program` is deliberately
-- NOT here: it is configuration, like pricing_policy and the rate cards, and it
-- is created by the migration rather than by seed.sql — so deleting the
-- singleton would leave the program with no config and no way back.
DELETE FROM referral_earning;
DELETE FROM referral_payout;
DELETE FROM payout_details_access;
DELETE FROM referral;
DELETE FROM project;
DELETE FROM organisation;
DELETE FROM user;
