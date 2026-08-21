import { ops2RouterBase } from "../data/ops2Routing";

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
