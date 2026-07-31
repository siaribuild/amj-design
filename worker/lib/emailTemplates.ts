// Runtime loader for the editable email templates authored in Sanity
// (the `emailTemplate` documents; see sanity/schemaTypes.ts).
//
// Transactional emails render from these when a template for the key exists.
// EVERY send also carries a built-in fallback (the original inline copy at the
// call site), so a Sanity outage — or a not-yet-authored key — never blocks a
// send. That matters most for the sign-in / tracking one-time codes: a CMS blip
// must never stop a customer logging in.
import type { Env } from "../types";

export interface EmailTemplate {
  subject: string;
  body: string;
}

// Per-isolate cache. Templates change rarely, so a short TTL keeps edits flowing
// without a Sanity round-trip on every email. A SUCCESSFUL fetch is cached (even
// when it resolves to null — a genuinely absent key); a FAILURE (network/timeout/
// non-200) is never cached, so a transient blip self-heals on the next send.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; tpl: EmailTemplate | null }>();

// Newest-wins in the vanishingly unlikely event two documents share a key.
const QUERY = `*[_type=="emailTemplate" && key==$key]|order(_updatedAt desc)[0]{subject, body}`;

export async function loadEmailTemplate(env: Env, key: string): Promise<EmailTemplate | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.tpl;
  if (!env.SANITY_PROJECT_ID) return null;
  // Email templates are internal ops content, so the public dataset grant does
  // not expose them to anonymous reads — the worker must authenticate. Without a
  // token the query resolves to nothing and the caller keeps its built-in copy.
  if (!env.SANITY_READ_TOKEN) return null;
  try {
    const dataset = env.SANITY_DATASET || "production";
    const qs = new URLSearchParams({ query: QUERY });
    qs.set("$key", JSON.stringify(key));
    // Authenticated reads go to the live API (not the public CDN). Tight deadline:
    // an email must not wait on a slow CMS — on any miss we fall back.
    const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${dataset}?${qs.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.SANITY_READ_TOKEN}` },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null; // transient — do NOT cache
    const body = await res.json<{ result?: { subject?: unknown; body?: unknown } | null }>();
    const r = body?.result;
    const tpl = r && typeof r.subject === "string" && r.subject && typeof r.body === "string" && r.body
      ? { subject: r.subject, body: r.body }
      : null;
    cache.set(key, { at: Date.now(), tpl }); // cache the resolved state (template or known-absent)
    return tpl;
  } catch {
    return null; // timeout / network error — fall back, don't cache
  }
}

// Replace every [token] with the supplied value. A token the caller does NOT
// provide is left exactly as written (the authoring UI lists which tokens each
// template supports, so an unknown one is an editor mistake worth seeing rather
// than a silent blank). A provided-but-null value resolves to "" — that is how an
// optional line (e.g. [scheduleNote]) simply disappears when there's nothing to say.
export function applyPlaceholders(
  text: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return text.replace(/\[([a-zA-Z0-9_]+)\]/g, (whole, token) =>
    Object.prototype.hasOwnProperty.call(vars, token) ? String(vars[token] ?? "") : whole);
}
