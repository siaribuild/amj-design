// Security response headers, in version control rather than in a dashboard.
//
// The repository had exactly three of these, all on private file downloads
// (routes/files.ts, and one on the ops download). Every HTML shell, every hashed
// asset and every API response went out with content-type and cache-control and
// nothing else — no CSP, no framing policy, no HSTS, no Referrer-Policy. Git
// history shows this was never attempted rather than deliberately declined,
// which is why there is no "we decided against it" comment to honour here.
//
// Applied at the single fetch handler in ../index.ts so no exit path can forget.
import type { Env } from "../types";

// ── Content-Security-Policy ─────────────────────────────────────────────────
// Every origin below is one this app actually loads, verified against the built
// bundles and the source rather than guessed:
//
//   challenges.cloudflare.com   Turnstile — a script AND an iframe, on the
//                               contact form and the sign-in screen.
//   cdn.sanity.io               product/post imagery, and file links.
//   *.api.sanity.io             the browser-side catalogue query…
//   *.apicdn.sanity.io          …and its CDN host (useCdn: true in data/sanity.ts).
//   images.unsplash.com         editorial imagery — 113 references in the bundle.
//   *.basemaps.cartocdn.com     the Leaflet tiles on the Contact page map.
//   fonts.googleapis.com        the @import in styles/fonts.css…
//   fonts.gstatic.com           …and the font files it pulls.
//
// script-src is genuinely strict: 'self' plus Turnstile, no 'unsafe-inline' and
// no 'unsafe-eval'. Verified there is no eval() or new Function() in any built
// bundle, so nothing needs the escape hatch.
//
// style-src keeps 'unsafe-inline' and that is not laziness: both shells carry an
// inline <style>, emotion/MUI inject rules at runtime, and React style={} props
// are inline styles. Removing it needs a nonce threaded through server-rendered
// HTML and a styling-library change — a project, not a header. Said plainly here
// so nobody reads the policy as stronger than it is.
//
// Deliberately ABSENT: Cross-Origin-Embedder-Policy. The Carto tiles and the
// Unsplash and Sanity images carry no Cross-Origin-Resource-Policy header, so
// require-corp would blank the map and every image on the site.
const SHARED_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
];

const CUSTOMER_CSP = [
  ...SHARED_CSP,
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://cdn.sanity.io https://images.unsplash.com https://*.basemaps.cartocdn.com",
  "connect-src 'self' https://*.api.sanity.io https://*.apicdn.sanity.io https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
].join("; ");

// The ops console loads no Turnstile, no map and no editorial photography, so it
// gets a smaller list. It DOES read Sanity (ops/main.tsx hydrates the catalogue)
// and shares the customer stylesheet, so those stay.
const OPS_CSP = [
  ...SHARED_CSP,
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://cdn.sanity.io",
  "connect-src 'self' https://*.api.sanity.io https://*.apicdn.sanity.io",
].join("; ");

// API JSON, hashed assets, sitemap/robots: none of these load subresources, so
// they can carry the strictest possible policy without any risk of breakage.
const NON_DOCUMENT_CSP = "default-src 'none'; frame-ancestors 'none'";

/** Ship the CSP as Report-Only first.
 *
 *  A policy that silently blanks the map or an image is worse than no policy,
 *  because it fails in a way nobody reports. Deploy with this false, read the
 *  violation reports the browser console gives you, then flip it — one constant,
 *  one line, no other change. Everything else in this file is already enforcing:
 *  the headers below cannot break a page that works today. */
const CSP_ENFORCE = false;

export function securityHeaders(opts: {
  isOps: boolean; isHtml: boolean; isProduction: boolean; isHttps: boolean;
}): Record<string, string> {
  const h: Record<string, string> = {
    // A wrong content-type becoming a script is the whole reason this exists.
    "X-Content-Type-Options": "nosniff",
    // Send the origin cross-site, never the path: quote and order URLs carry
    // references, and those should not travel to an image host.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // frame-ancestors is the modern control; X-Frame-Options is kept for the
    // browsers and scanners that still only read it. They must agree.
    "X-Frame-Options": "DENY",
    // Nothing in this app asks for any of these. Denying them means a future
    // dependency cannot start asking on a page's behalf.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };

  // Only over HTTPS, and only in production: an HSTS header on a local http dev
  // server would pin the browser to https://localhost and break the next run.
  // No `preload` — that is a one-way door onto a browser-shipped list, and it is
  // the owner's decision, not a default. Cloudflare's own edge HSTS toggle
  // remains the broader control; this covers Worker-served responses.
  if (opts.isProduction && opts.isHttps) {
    h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }

  const policy = opts.isHtml ? (opts.isOps ? OPS_CSP : CUSTOMER_CSP) : NON_DOCUMENT_CSP;
  h[CSP_ENFORCE || !opts.isHtml ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only"] = policy;
  return h;
}

/** Attach the policy to a response without disturbing what it already set.
 *
 *  Only-if-absent, deliberately: routes/files.ts sets a STRONGER
 *  `Referrer-Policy: no-referrer` and `Cache-Control: private, no-store` on
 *  private downloads, and a blanket overwrite here would quietly weaken the one
 *  place that had already thought about it.
 *
 *  A Response from ASSETS.fetch has immutable headers, so this always builds a
 *  new Response rather than mutating in place. Redirects and 304s carry no body;
 *  passing `null` for those is required, not an optimisation. */
export function applySecurity(res: Response, opts: {
  isOps: boolean; isProduction: boolean; isHttps: boolean;
}): Response {
  const isHtml = (res.headers.get("content-type") ?? "").includes("text/html");
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(securityHeaders({ ...opts, isHtml }))) {
    if (!headers.has(k)) headers.set(k, v);
  }
  const bodyless = res.status === 204 || res.status === 304 || (res.status >= 300 && res.status < 400);
  return new Response(bodyless ? null : res.body, { status: res.status, statusText: res.statusText, headers });
}

export const securityOptions = (env: Env, url: URL, host: string) => ({
  isOps: host.startsWith("ops."),
  isProduction: env.APP_ENV === "production",
  isHttps: url.protocol === "https:",
});
