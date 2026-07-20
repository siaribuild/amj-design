-- 0009_business_and_prefs — registered business details + a price-display pref.
--   abn             the account's ABN (business name is the existing user.company)
--   price_gst_mode  'inc' | 'ex' — whether estimates show prices inc/ex GST (NULL = inc)
ALTER TABLE "user" ADD COLUMN abn TEXT;
ALTER TABLE "user" ADD COLUMN price_gst_mode TEXT;
