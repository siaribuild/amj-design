-- The drawing parser's progress milestones have words of their own - "Rechecking
-- 2 unclear openings" - that move no counter and change no phase. Persist them
-- beside the phase so a recheck is work the customer sees, not a pause.
-- Additive: one nullable column, no rebuild, no cascade exposure.
ALTER TABLE ai_job_claim ADD COLUMN drawings_message TEXT;
