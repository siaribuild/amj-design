-- SCAFFOLD — WS5: per-segment thermal band for composite lites.
-- Achieves: let each composite SEGMENT (a lite of a parent quote_line, added in
-- migration 0028) carry its OWN resolved thermal band, basis and review flag, so an
-- awning lite can hold 0.37–0.41 while its fixed lite holds 0.50–0.56 — instead of
-- inheriting one intersected parent band. This is the persistence half of the
-- composite fix; the estimator selects glass per segment against these columns.
--
-- Columns mirror the opening-level requirement shape so the same precedence +
-- glass-selection code serves both a whole opening and a single lite.
--
-- STATUS: scaffold — columns defined; population (the AI→segment bridge) and reads
-- land in the implementation phase. Additive + nullable, so existing segments are
-- unaffected until written.

-- Per-lite resolved band as JSON: {maxUValue, minShgc, maxShgc, shgcTarget}.
ALTER TABLE quote_line ADD COLUMN segment_requirements_json TEXT;

-- Provenance of that band: 'explicit_ref' | 'shared_type' | 'computed' | 'none'
-- (mirrors thermal/types.ts BandBasis) — drives the line's copy + learnings gating.
ALTER TABLE quote_line ADD COLUMN segment_requirement_basis TEXT;

-- Non-blocking thermal warning for this lite: 1 when the chosen glass did not meet
-- the band (line still priced + submittable). Reason travels in review_json.
ALTER TABLE quote_line ADD COLUMN segment_thermal_review INTEGER NOT NULL DEFAULT 0;
