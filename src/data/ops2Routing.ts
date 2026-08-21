// ops2's path prefix — one rule, two callers.
//
// ops2 and the legacy console coexist on the same host, split by path
// (`docs/adr/0002-ops2-path-routing-not-hash.md` and `docs/specs/ops2.md` §12,
// both currently on the `design/ops2-planning` branch only — and NOT this
// branch's docs/adr/0002, which is a trade-status ADR; the number is contested
// between branches, so cite the filename):
// the Worker's `opsShellFor()` decides which BUNDLE to serve,
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

/**
 * The same boundary, in the other direction: a BROWSER-facing path from a
 * ROUTER path.
 *
 * `ops2RouterBase()` above answers "where does the router mount"; this answers
 * "what does an href have to say". They are two halves of one rule and they
 * live together for the reason stated at the top of this file — written twice,
 * they disagree by one character and a link quietly leaves the application.
 *
 * The distinction they encode:
 *
 *   - Router paths (`Route path`, `history.push`, active-state comparisons) are
 *     basename-RELATIVE. React Router adds the base back on, so prefixing one
 *     yields `/ops2/ops2/projects`.
 *   - An `href` is never seen by the router. The browser resolves it against
 *     the document, so it must carry the base itself.
 *
 * Missing that is a defect that exists ONLY in the coexistence rollout state:
 * while ops2 is served under /ops2, `href="/projects"` requests /projects on
 * the ops host, and `opsShellFor()` answers with the legacy console. The
 * intercepted primary click went through `history.push` and was fine — so
 * middle-click, Ctrl/Cmd-click, "open in new tab" and "copy link address" were
 * the only ways to find it.
 *
 * IDEMPOTENT, deliberately. ops2's tab-bar anchors are corrected in place by a
 * MutationObserver (Ionic's IonTabButton spends one `href` prop on both its
 * routing key and its anchor), which means this function reads its own output
 * on the next mutation. Without idempotence that is an infinite loop, and it
 * was: the page hung and seven browser tests timed out.
 *
 * With `base` of "/" — the post-switch-over state — it is the identity, which
 * is what lets one bundle be correct in every rollout state.
 */
export function withBase(base: string, routerPath: string): string {
  if (base === "/") return routerPath;
  if (routerPath === base || routerPath.startsWith(`${base}/`)) return routerPath;
  return `${base}${routerPath}`;
}
