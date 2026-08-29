# 0001 — Role membership lives in the application database, not Cloudflare Access groups

Date: 2026-08-17
Status: accepted
Deciders: architect (decision point delegated by GRILL-CONCLUSIONS §5 C8)

## Context

ops2 replaces domain-based role *assignment* with per-user RBAC (D5). Cloudflare Access
remains the authentication perimeter (C8). Role membership could live in Access groups
(managed in the CF dashboard, arriving as JWT claims) or in the application database
(managed from an ops2 admin screen). The owner's framing — "per user", future limited-access
hires — pointed at the database, but the option had to be costed, not assumed.

## Decision

Roles are stored per user in the application database — the existing `user.role` column,
which already gates today's admin-only surfaces, already has a guarded, audited write path
(`PATCH /api/ops/staff/:id` with an atomic last-admin guard), and is read fresh per request.
ops2 changes its vocabulary (admin / reviewer / manufacturer) and its enforcement (capability
model + route manifest), not its home. No new table.

## Consequences

- A role change applies on the subject's next request (spec AC-29) — impossible with Access
  group claims, which are minted into the JWT at session issuance and only refresh on
  re-authentication.
- Role administration, the last-admin invariant (AC-30), the lockout self-heal (AC-31), and
  audit logging all stay in-app and testable; the abuse battery can construct a
  manufacturer-role identity (AC-66a) without CF dashboard access.
- Admission remains two gates (I7): the Access policy (edge, MFA) and the granted role
  (application). Revoking either locks the person out; the edge-side revocation benefit of
  Access groups is therefore retained via Access membership itself.
- One place for the role fact — no grant table beside `user.role`, so the soak period has a
  single role store shared by both consoles, and Worker rollback (AC-34) needs no data
  ceremony.
- Cost accepted: the application must keep its own role UI honest (R2's screen), and a
  D1 outage degrades authorization with the rest of the application (it already does — every
  ops read is D1-backed).
