# ADR 0001 — Submission gate: identity from the session, account as the single contact source

Date: 2026-08-18 · Status: accepted · Owner: architect
Context: user-registration Phase 1 (`docs/specs/user-registration-phase-1.md`,
design `docs/specs/user-registration-phase-1-design.md`).

## Decision

1. **Submitting a project for review requires a session that owns the project.** The
   ownership test is in the SQL (`WHERE id = ? AND owner_user_id = ?`), never a post-check.
   The submit endpoint carries its own auth; `ownedProject` (claim cookie + guest grant)
   is unchanged for every other caller.
2. **The account row is the only source of submission identity.** `contact_*` on the
   project is written from the `user` row at the moment of submission (a point-in-time
   snapshot for ops), never from the request body. The body carries only the per-project
   delivery destination.
3. **Account contact facts have one write path** — `POST /api/auth/profile` →
   `worker/lib/account.ts#updateAccountDetails` (allowlist, validation, one UPDATE scoped
   to the session user). The submit endpoint reads and refuses (`incomplete_profile`);
   it never writes account fields.
4. **Validation truth lives in `src/data/`** (`phone.ts`, `accountDetails.ts`), imported
   by both the Worker (authority) and the browser (advisory). One AU phone validator,
   built on the one existing `normalizePhone`.
5. **`discount_percent = 0` at creation is written explicitly in both INSERT statements**
   (customer and internal). The column default is not changed — a SQLite default change
   means a table rebuild, and a rebuild in this schema has already fired
   `ON DELETE CASCADE` on production rows.
6. **A NULL `user.name` is never backfilled by derivation.** The email local part is a
   display-only fallback (`displayName` in the client model); the raw stored value is
   what edit surfaces bind, so a save can never launder the derivation into the database.

## Consequences

- Zero new endpoints in Phase 1; the unauthenticated surface shrinks (the anonymous
  submit path is deleted).
- The referral attribution seam (`worker/routes/auth.ts:70-121`) is preserved by not
  editing it — the gate reuses `/verify` as-is.
- Phase 2 (ABN, trade verification) attaches to the same profile write path and the same
  details step without new seams.
