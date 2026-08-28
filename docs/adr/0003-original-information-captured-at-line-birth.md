# 0003 — Original information is captured at line birth, not resolved from live tables at issue

Date: 2026-08-17
Status: accepted
Deciders: architect (R3 implements)

## Context

The divergence record (spec §9.2) compares every issued line field against its **original
information** — extracted opening dimensions, customer-submitted values, or the estimator's
proposal — resolved to one original value per field. Two candidate mechanisms: (a) resolve
the baseline at issue time from the tables that hold those facts today
(`opening_instance`, `ai_proposal_line`, `evidence_items`, `quote_line`); (b) capture a
write-once baseline when the line is born.

Resolution-at-issue fails on the facts of the schema: `opening_instance` is updated in place
by re-extraction (`worker/lib/ai/pipeline.ts:774`), and a customer-configured `quote_line`
is edited in place with no prior-value journal (`edited_fields` records which fields
changed, never what they were). A baseline read from live tables at issue would drift with
the machine's latest state and be unresolvable for customer-origin lines.

## Decision

A write-once **`line_baseline`** row per parent quote line, captured at the moment the line
first receives values from a non-staff source (proposal application, schedule-parse
application, or customer submission — spec A-9). `worker/lib/original.ts` is the only module
that writes or reads it (`captureBaseline` idempotent; `resolveBaseline` for issue-time
comparison and the derivation surface). The divergence comparison set is "every field
present in the baseline" (AC-7c's rule), and absence of a baseline entry is absence of a
divergence (AC-7b). No backfill: lines created before R3 ships have no baseline, and
inventing one from current values would fabricate "originals".

## Consequences

- The baseline is a distinct frozen fact, following the codebase's existing precedent for
  moment-frozen values (`configuration_snapshot_json`, `referral_percent_at_issue`,
  delivery settle snapshot) — so storing it does not violate one-place-per-fact: "what the
  line first carried" and "what the estimator currently proposes" are different facts.
- Divergence recording is exact under re-extraction, re-estimation, and any number of
  staff edits, with no per-edit history kept (consistent with the owner's 2026-08-17
  removal of undo, and with C5's once-at-issue rule).
- Cost accepted: one new table, one new deliberate `ON DELETE CASCADE` onto `quote_line`
  (a deleted line has no divergence to report), recorded in the migration ledger so any
  future `quote_line` rebuild counts `line_baseline` among its children.
