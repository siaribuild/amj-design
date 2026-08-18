# ADR-0002 — Trade status is derived from the application ledger, never stored on `user`

Date: 2026-08-19 · Status: accepted · Owner: architect
Context: registration Phase 2 (trade verification), design
`docs/specs/user-registration-phase-2-design.md` §3/§6.4; spec
`docs/specs/user-registration-phase-2.md` §9.1, E-P2-6, AC-P2-29, D2.1.

## Decision

The account row (`user`) holds only the **live trade facts**: `abn`, `company`,
`trade_label`, `discount_percent`. Whether an account is trade-verified, pending, rejected or
revoked is **derived on every read** from the `trade_application` ledger:

- *verified* = a **standing grant** exists (`status='approved' AND revoked_at IS NULL AND
  superseded_at IS NULL` — at most one per account, enforced by a partial unique index);
- *pending* = a `status='pending'` row exists (at most one, same mechanism);
- *rejected* / *revoked* = the outline of decided/revoked rows, for display only.

No `trade_status` column exists anywhere.

## Why

1. **The five-state enum is provably wrong.** Spec E-P2-6 lets a verified account re-apply
   with a new ABN: the account is *verified and pending at once*. One column cannot say that;
   two facts can.
2. **One place per fact.** A stored flag beside the ledger is a second home for the same
   truth, and the two will drift on exactly the paths that matter (crash between UPDATEs,
   concurrent decisions). The partial unique indexes make the ledger's invariants
   database-enforced instead of code-promised.
3. **The duplicate rule stays honest.** Ops may edit `user.abn` (logged, non-granting —
   spec §4.7). "Is this ABN currently verified elsewhere?" must be answered from the ABN that
   ABR actually saw — the standing grant's frozen copy — not from an editable live column.
4. **Revocation is instant for free** (AB-P2-15). Pricing already reads
   `discount_percent` per request; deriving status means there is nothing else to invalidate —
   no session, no token, no cached flag.

## Consequences

- Status reads cost up to three indexed point-queries on `trade_application`
  (`tradeStateOf`); acceptable on the surfaces that need it (`/me`, ops customer views).
- The customer-facing five-state vocabulary (none/pending/verified/rejected/revoked) survives
  as a rendering of the derived struct, not as data.
- Grandfathered accounts are representable honestly: the migration inserts an approved ledger
  row with `decided_via='grandfathered'` (NULL ABN where none exists), so history and
  provenance need no special case.
- Any future feature wanting "is trade" must call `tradeStateOf` (or the standing-grant
  EXISTS subselect for SQL), never add a column.
