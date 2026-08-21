import { ops2RouterBase, withBase } from "../data/ops2Routing";

/**
 * The router's base, detected ONCE at boot from the URL the browser actually
 * loaded (`docs/adr/0002-ops2-path-routing-not-hash.md`, on the
 * `design/ops2-planning` branch — not this branch's 0002, which is unrelated).
 *
 * During coexistence the Worker serves this bundle under /ops2, so the router
 * mounts there; after switch-over it serves it at the root, so the same bundle
 * mounts at "/". The rollout is a Worker deploy and the client reads the result
 * rather than being told.
 *
 * READ AT MODULE SCOPE ON PURPOSE, and that is why it is a module of its own
 * rather than a line inside Ops2App: the base is a property of how this
 * document was served, not of where the user has navigated since, and
 * recomputing it from a later location is how a router quietly re-bases itself
 * mid-session. Two callers now — the router, and the Settings root, which
 * prints it so a wrong base is VISIBLE rather than merely wrong.
 */
export const BASENAME = ops2RouterBase(window.location.pathname);

/**
 * A path the BROWSER will resolve, from a path the ROUTER understands.
 *
 * BASENAME bound to `withBase()`, which is where the rule and its reasoning
 * live — beside `ops2RouterBase()`, because "where the router mounts" and "what
 * an href must say" are two halves of one boundary and the file that owns one
 * owns the other. Read it before touching either.
 *
 * Every browser-facing URL ops2 emits goes through here: the rail and drawer
 * links, the tab bar's anchors (corrected after render — see
 * ./nav/tabHrefs.ts), and the sign-out fallback. Router paths must NOT.
 */
export function browserHref(routerPath: string): string {
  return withBase(BASENAME, routerPath);
}
