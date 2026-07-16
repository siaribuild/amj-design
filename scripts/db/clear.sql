-- Wipe all transactional data (FK-safe order: children before parents).
-- Schema is left intact (managed by migrations). KV (sessions/OTP) is not D1 and
-- is cleared separately by the reset script when running locally.
DELETE FROM payment;
DELETE FROM order_line;
DELETE FROM file_asset;
DELETE FROM "order";
DELETE FROM revision_line;
DELETE FROM quote_line;
DELETE FROM quote_revision;
DELETE FROM guest_grant;
DELETE FROM notification;
DELETE FROM audit_event;
DELETE FROM membership;
DELETE FROM project;
DELETE FROM organisation;
DELETE FROM user;
