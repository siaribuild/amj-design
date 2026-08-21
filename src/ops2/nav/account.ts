import { useEffect, useState } from "react";
import { BASENAME } from "../shellBase";

// The signed-in staffer, and the one way out of the console.
//
// This is REAL, not a fixture, and that is deliberate. The rail's foot is
// specified content (`docs/design/ops2-r1-interaction-plane-shell.md` §2.1:
// name, email, `Role · {role}`, `Sign out`), and R-167 exists because the role
// governs gates the staffer can feel but never see. A hard-coded name and a
// hard-coded "Administrator" would look right in every screenshot and be wrong
// for whoever is not the person in the fixture — which is the exact shape of
// the defect the handover records as "a claim contradicted by the file it
// described".
//
// It is also the only network call the shell makes. src/ops2/main.tsx mounts
// without waiting on anything, so this resolves after first paint and the rail
// renders its unknown state until it lands. Navigation never waits on it.

// The two response shapes the shell reads. Narrow on purpose: nothing here
// needs the rest of what /api/ops/me returns, and naming only what is used
// keeps this from becoming a second copy of the ops user type.
type MeUser = { email?: string; name?: string | null; role?: string | null };
type MeResponse = (MeUser & { user?: MeUser }) | null;
type LogoutResponse = { accessLogout: string | null };

export interface Ops2Account {
  email: string;
  name: string | null;
  role: string | null;
}

/** Two initials from a name, or from the local part of an email. */
export function initialsOf(account: Ops2Account | null): string {
  const source = account?.name?.trim() || account?.email.split("@")[0].replace(/[._-]+/g, " ") || "";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** "admin" → "Admin". The server's word, capitalised — not a word of our own. */
export function roleLabel(account: Ops2Account | null): string | null {
  const role = account?.role?.trim();
  if (!role) return null;
  return role[0].toUpperCase() + role.slice(1);
}

/**
 * ONE request per document, shared by every caller.
 *
 * Measured in the dev server before this existed: /api/ops/me and
 * /api/ops/brand were each requested TWICE on every load, because the rail and
 * the page chrome both ask for the account and both render the wordmark. Two
 * requests for one fact is not just waste — the two can answer differently,
 * and then the name in the rail and the name in the top bar disagree.
 *
 * A module-level promise rather than a React context: this is a fact about the
 * document, it never changes within one, and a context would make every
 * consumer depend on a provider being somewhere above it.
 */
let pending: Promise<Ops2Account | null> | null = null;

function fetchAccount(): Promise<Ops2Account | null> {
  pending ??= fetch("/api/ops/me", { credentials: "same-origin" })
    .then((res) => (res.ok ? (res.json() as Promise<MeResponse>) : null))
    .then((body) => {
      const user = body?.user ?? body;
      return user?.email
        ? { email: user.email, name: user.name ?? null, role: user.role ?? null }
        : null;
    })
    .catch(() => null);
  return pending;
}

/**
 * The signed-in staffer, or null until (and unless) the API answers.
 *
 * Null is a real state, not just a loading one: behind Cloudflare Access the
 * person is signed in whether or not this endpoint answers, so a failure here
 * must never read as "signed out" and must never gate navigation. The rail
 * shows what it knows.
 */
export function useOps2Account(): Ops2Account | null {
  const [account, setAccount] = useState<Ops2Account | null>(null);
  useEffect(() => {
    let live = true;
    void fetchAccount().then((next) => { if (live) setAccount(next); });
    return () => { live = false; };
  }, []);
  return account;
}

/**
 * Sign out — the legacy console's flow, carried across verbatim in reasoning
 * because the reasoning is the whole of it (src/ops/OpsApp.tsx:113 and
 * worker/routes/ops.ts:250):
 *
 *   Behind Cloudflare Access, clearing local state achieves NOTHING. Access
 *   re-injects a valid assertion on the very next request, so destroying the KV
 *   session and clearing the cookie sign nobody out — a refresh lands the
 *   staffer straight back in the console. Only Access can end an Access
 *   session, and only from the browser. So the request is awaited (not
 *   fire-and-forget: the old version raced it and showed a signed-out screen
 *   whether or not anything had been signed out), and the endpoint it hands
 *   back is navigated to.
 *
 * In local dev Access is off, `accessLogout` is null, and the session cookie
 * really is the identity — so the reload is what applies it. That is also why
 * this cannot be exercised end-to-end here: the Access redirect only exists in
 * production.
 */
export async function ops2SignOut(): Promise<void> {
  let accessLogout: string | null = null;
  try {
    const res = await fetch("/api/ops/auth/logout", { method: "POST", credentials: "same-origin" });
    if (res.ok) ({ accessLogout } = (await res.json()) as LogoutResponse);
  } catch {
    // The local session may or may not have been destroyed. Fall through: in
    // Access mode the redirect is what matters and it does not depend on this.
  }
  // BASENAME, not "/". On the ops host during coexistence "/" is the LEGACY
  // console, so a dev-mode sign-out landed the staffer in the console ops2
  // replaces. After switch-over BASENAME is "/" and this is the same thing.
  window.location.href = accessLogout ?? BASENAME;
}
