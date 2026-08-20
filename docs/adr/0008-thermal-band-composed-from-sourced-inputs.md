# 0008 — The thermal band is composed from sourced inputs, and the default is the owner's dial

Status: accepted (owner corrections 1–3 and decisions T1–T6, 2026-08-20; spec
`thermal-model-backend.md` rev 3)

## Decision

A per-opening thermal band is composed from named, versioned rule contributions over a declared
input contract in which every document-derived input carries its source or is absent — an
unsourced value is unrepresentable. The default Uw cap is resolved from a ledger
(`thermal_default_band`, newest row active, rows never mutated) seeded at the pre-existing 4.0;
its value is the owner's business decision, taken with a calibration view that states demand,
assertion, and deliverable catalogue at each candidate cap. Calibration never writes and never
recommends a number. `requirement_basis` keeps its four values; `plan_derived` means "at least
one document-sourced input contributed". The retained orientation→SHGC mapping is versioned and
labelled `unsourced_legacy` rather than re-derived. Document extraction is consumed through the
contract; producing it belongs to the drawing/scanning thread.

## Context

444 of 444 openings without a report received one identical constant; the one function that
would differentiate them had never executed in production; a plan-informed band was recorded
identically to a blind one. An attempt to *derive* a tighter default from two projects' reports
was withdrawn by the owner — it would have cut deliverable published catalogue rows from 49 to
28. Separately, the basis CHECK sits on a self-referencing cascade parent, so a fifth basis
value means a forbidden table rebuild; and a parallel thread already owns extraction.

## Consequences

Two openings differ when their inputs differ, and the record says why. Every band is auditable:
inputs used, inputs missing, rules applied, dial version. The extraction thread's arrival is a
rising `plan_derived` count with zero code change here. Turning the dial is cheap, sourced, and
consequence-visible; deploying the feature moves no estimate.

## Rejected

- Deriving the default from parsed reports (`observed_report_maximum`): withdrawn by the owner;
  the method is absent from the enum so it cannot quietly return.
- Auto-tuning or auto-recommending from calibration: correction 2 is the proof an automatic
  tightening would have been exactly wrong.
- A fifth basis value: table rebuild on a cascade parent — forbidden.
- Re-deriving the solar mapping: new unsourced numbers with more confidence; the legacy mapping
  is labelled instead, so a sourced replacement is a recorded supersession.
- Building orientation extraction/precedence here: owned by the drawing thread; building it
  twice guarantees a merge fight and two resolution semantics.
