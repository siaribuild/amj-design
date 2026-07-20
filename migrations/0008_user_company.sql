-- 0008_user_company — a company / trade name on the user's personal profile.
-- The full organisation layer (organisation + membership from 0001) is separate;
-- this is just an editable company name shown on the dashboard + profile.
ALTER TABLE "user" ADD COLUMN company TEXT;
