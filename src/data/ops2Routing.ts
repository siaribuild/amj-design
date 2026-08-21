// ops2's path prefix — one rule, two callers.
//
// ops2 and the legacy console coexist on the same host, split by path (ADR
// 0002, spec §12): the Worker's `opsShellFor()` decides which BUNDLE to serve,
// and the ops2 router decides which BASE to mount at. Those are two decisions
// about one boundary, and they have to be the same boundary — if the Worker
// serves the ops2 shell for a path the router does not consider its own, the
// deep link loads the right bundle and then 404s inside it, which looks like a
// routing bug and is really a one-character disagreement.
//
// The rule is a path SEGMENT boundary, not a substring: "/ops2extra" contains
// the prefix and is not under it. Pinned in scripts/tests/unit.test.mjs.
//
// Lives in src/data (not in src/ops2) because the Worker imports it too, the
// same way it imports the catalogue, and because nothing here is React.

export const OPS2_BASE = "/ops2";

/** True when `pathname` addresses ops2 — the prefix itself, or anything below it. */
export function isUnderOps2(pathname: string): boolean {
  return pathname === OPS2_BASE || pathname.startsWith(`${OPS2_BASE}/`);
}

/**
 * The base the ops2 router should mount at, detected from the URL at boot.
 *
 * `/ops2` while the two consoles coexist (rollout state 1); `/` once ops2 takes
 * the root at switch-over (state 2) and after the legacy console is deleted
 * (state 3). The same bundle serves every state — the switch-over is a Worker
 * deploy, and this function reads the result of it rather than being told.
 */
export function ops2RouterBase(pathname: string): string {
  return isUnderOps2(pathname) ? OPS2_BASE : "/";
}
