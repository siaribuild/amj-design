# 0002 — ops2 uses path-based routing, not hash routing

Date: 2026-08-17
Status: accepted
Deciders: architect

## Context

Spec AC-24 requires a deep link opened **cold, with no ops session**, to survive Cloudflare
Access sign-in and land on the addressed record. The spec's §7.1 R1 row and the exploratory
UX-SPEC assumed hash routing ("the router resolves the hash after auth"). That claim is only
true when an Access session already exists: a URL fragment is never sent to the server, so
Access's server-side stored redirect URL cannot carry it, and the interactive login flow
(rendered login page, IdP hops, form POST) drops it. Hash routing therefore fails AC-24 in
exactly the scenario AC-24 names.

## Decision

ops2 routes are **paths** (React Router 7, already a dependency, history API), served by a
Worker-side SPA fallback: on the ops host, extension-less non-API GETs serve the ops2 shell.
The router detects its base at boot (`/ops2` prefix during coexistence, `/` after
switch-over), so the same bundle serves both routing states. ops2 never uses a `/r/…` path —
`worker/index.ts` intercepts `GET /r/<XXX-XXX>` on every host for referral redirects.

## Consequences

- Access's redirect URL carries the full deep-link target by construction; AC-24 is
  satisfiable and testable (production smoke for the Access half).
- The Worker gains a small, explicit shell-selection function — also the single point where
  switch-over and the `/legacy` fire escape are implemented (one-line, versions-revertible
  deploys).
- Reloading any ops2 URL works without a 404, which hash routing would also have given —
  nothing is lost.
- The spec's incidental "hash routing" wording is corrected by the PM; AC-24 was always the
  governing criterion.
