# 0011 — Remove `thermal.dataSource` from the CandidateOutcome contract

**Status:** accepted · **Date:** 2026-08-24 · **Owner stage:** architect (delegated by
`docs/specs/ops2-why-this-product-grill-conclusions.md` §5 constraint 2)

## Context

`src/data/recommendation.ts` declares an additive-only stability rule: fields are added,
never renamed or re-typed, and `SelectionOutcome.version` names the emitting model. The
`certified` removal (spec Phase 1, R5) deletes the certification concept outright — code,
Studio schema, and dataset values — which leaves `CandidateOutcome.thermal.dataSource`
(`"certified" | "estimated" | null`) describing a distinction that no longer exists
anywhere in the product. The conclusions require this be resolved out loud: remove the
field, or retain it permanently null.

## Decision

Remove the field from the TypeScript contract, and bump `SELECTION_VERSION`
(`worker/lib/estimator/ladder.ts`) from `ladder-v1` to `ladder-v2`. The contract header
records this as the one sanctioned removal.

## Consequences

- Stored `outcome_json` written under `ladder-v1` keeps its `dataSource` key and parses
  unchanged — JSON with an extra key is not an error (pinned by CERT-AC-9's fixture
  test). The stability rule's actual beneficiaries — readers of old rows — lose nothing.
- `ladder-v2` outcomes never had the field, which is what makes the removal compatible
  with rule 1: nothing was removed *from a version*; a new version was declared.
- No reader compares against the literal `"ladder-v1"` (verified 2026-08-24); the
  version string lives only in storage columns (`selection_run.ranker_version`).

## Rejected

Retaining the field permanently null: keeps dead vocabulary in a facts contract whose
purpose is to be rendered by skins, and invites a future surface to rebuild
certified-vs-estimated semantics that the owner explicitly deleted (R5: "products have a
single source! That's in their thermal properties").
