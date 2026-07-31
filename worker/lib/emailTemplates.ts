// Runtime loader for the editable email templates authored in Sanity
// (the `emailTemplate` documents; see sanity/schemaTypes.ts).
//
// Transactional emails render from these when a template exists. EVERY send also
// carries a built-in fallback (the original inline copy at the call site), so a
// Sanity outage — or a not-yet-authored template — never blocks a send. That
// matters most for the sign-in / tracking one-time codes.
//
// Templates are looked up by document _id (which equals the templateKey the
// Worker sends with, e.g. "signin_code"). The public dataset exposes only
// dot-free ids to anonymous reads, so template ids must not contain a dot.
import type { Env } from "../types";

export interface EmailTemplate {
  subject: string;
  body: string;
}

// Per-isolate cache. Templates change rarely, so a short TTL keeps edits flowing
// without a Sanity round-trip on every email. A SUCCESSFUL fetch is cached (even
// when it resolves to null — a genuinely absent id); a FAILURE (network/timeout/
// non-200) is never cached, so a transient blip self-heals on the next send.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; tpl: EmailTemplate | null }>();

const QUERY = `*[_id == $id][0]{subject, body}`;

export async function loadEmailTemplate(env: Env, id: string): Promise<EmailTemplate | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.tpl;
  if (!env.SANITY_PROJECT_ID) return null;
  try {
    const dataset = env.SANITY_DATASET || "production";
    const qs = new URLSearchParams({ query: QUERY });
    qs.set("$id", JSON.stringify(id));
    // Public CDN + a tight deadline: an email must not wait on a slow CMS. On any
    // miss we fall back to the built-in copy the caller supplied.
    const url = `https://${env.SANITY_PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${dataset}?${qs.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null; // transient — do NOT cache
    const body = await res.json<{ result?: { subject?: unknown; body?: unknown } | null }>();
    const r = body?.result;
    const tpl = r && typeof r.subject === "string" && r.subject && typeof r.body === "string" && r.body
      ? { subject: r.subject, body: r.body }
      : null;
    cache.set(id, { at: Date.now(), tpl }); // cache the resolved state (template or known-absent)
    return tpl;
  } catch {
    return null; // timeout / network error — fall back, don't cache
  }
}

// Replace every [token] with the supplied value. A token the caller does NOT
// provide is left exactly as written. A provided-but-null value resolves to "" —
// that is how an optional line (e.g. [scheduleNote]) disappears when there's
// nothing to say.
export function applyPlaceholders(
  text: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return text.replace(/\[([a-zA-Z0-9_]+)\]/g, (whole, token) =>
    Object.prototype.hasOwnProperty.call(vars, token) ? String(vars[token] ?? "") : whole);
}
