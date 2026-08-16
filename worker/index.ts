// ═══════════════════════════════════════════════════════════════════════════
// OpenFrame — API Worker (Hono)
//
// Serves /api/* from route handlers; everything else is the built Vite SPA via
// the ASSETS binding (with SPA fallback to index.html). Routes: health, auth
// (OTP), projects, quote lifecycle, orders. Files land in M5.
// See docs/customer-backend-scaffold.md.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from "hono";
import type { Env } from "./types";
import { consumeAiJobs, reapAbandonedAiJobs, type AiExtractionJob } from "./lib/ai/jobs";
import { auth } from "./routes/auth";
import { projects } from "./routes/projects";
import { quote } from "./routes/quote";
import { orders } from "./routes/orders";
import { guest } from "./routes/guest";
import { files } from "./routes/files";
import { enquiries } from "./routes/enquiries";
import { referrals } from "./routes/referrals";
import { parse } from "./routes/parse";
import { ops } from "./routes/ops";
import { opsReferrals } from "./routes/ops-referrals";
import { integrations } from "./routes/integrations";
import { debug } from "./routes/debug";
import { buildSitemap, buildRobots, renderShell } from "./lib/shell";
import { ensureCatalogue } from "./lib/catalogue";
import { getActiveLocations } from "../src/data/catalogue";
import { drainLearningOutbox } from "./lib/issue";
import { reconcilePricing } from "./lib/pricing-admin";
import { referralSweep } from "./lib/referrals";
import { applySecurity, securityOptions } from "./lib/headers";

const api = new Hono<{ Bindings: Env }>();

// Liveness + binding presence. Cheap probe for `wrangler dev` and deploys.
api.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "apertly",
    env: c.env.APP_ENV ?? "unknown",
    bindings: { db: !!c.env.DB, files: !!c.env.FILES, kv: !!c.env.KV },
    time: new Date().toISOString(),
  }),
);

// Public showroom registry — active locations only, suburb-level (no street
// address). One source for the Contact page list + map + appointment validation.
api.get("/api/locations", (c) =>
  c.json({
    locations: getActiveLocations().map((l) => ({
      id: l.id, stateCode: l.stateCode, suburb: l.suburb,
      displayName: l.displayName, lat: l.lat, lng: l.lng,
      appointmentAvailable: l.appointmentAvailable,
    })),
  }),
);

// Passwordless email OTP + sessions (me / challenge / verify / logout).
api.route("/api/auth", auth);

// Customer project workspace (session- or claim-cookie scoped).
api.route("/api/projects", projects);

// Quote lifecycle: submit / issue-quote / quote / accept.
api.route("/api", quote);

// Order tracking, customer sign-off gates, and staff fulfilment seams.
api.route("/api/orders", orders);

// Anonymous read-only order tracking (email + reference, two-step).
api.route("/api/guest", guest);

// File uploads/downloads (R2): /api/files/*, /api/projects/:id/files.
api.route("/api", files);

// Public Contact-page enquiries (question / showroom appointment).
api.route("/api", enquiries);

// Referral program — the referrer's own screen and the public program figures.
api.route("/api", referrals);

// Schedule upload → parse into estimator draft lines (quota-limited).
api.route("/api", parse);

// Internal ops console API (staff-gated).
api.route("/api/ops", ops);
api.route("/api/ops/referrals", opsReferrals);

// Inbound webhooks (Sanity publish → catalogue cache invalidation).
api.route("/api/integrations", integrations);

// Admin/debug-only, secret-key-gated (disabled unless THERMAL_DEBUG_KEY is set).
api.route("/api/debug", debug);

// Any other /api/* path is a real 404 — never fall through to the SPA shell.
api.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

// Route a request to its response. Every `return` below is a page or a payload;
// the security policy is attached once, by the fetch handler that wraps this.
// There are eight exits here — two redirects, sitemap, robots, static assets, the
// API, the ops shell, the customer shell and the shell-render fallback — and
// before the wrapper existed, every one of them answered with no policy at all.
async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // ── ONE HOST PER SITE ───────────────────────────────────────────────────
    // www.* is a DNS alias of the apex, so it served the whole site a second
    // time — with its own sitemap and its own self-referencing canonicals, i.e.
    // a complete duplicate under a second canonical host. It also broke the
    // page silently: Sanity's CORS list allows the apex, and an Origin of
    // www.<domain> is a different origin, so every browser-side query failed
    // and the header lost its logo.
    //
    // A CNAME cannot fix that — DNS does not change the URL the browser holds,
    // and the Origin header is built from that URL. Only a redirect does.
    //
    // Narrow, for the same reasons as the slash rule below: GET/HEAD only, and
    // only the www. prefix — ops.* is a real, separate application.
    const host = request.headers.get("host") ?? url.hostname;
    if ((request.method === "GET" || request.method === "HEAD") && host.startsWith("www.")) {
      const target = new URL(url);
      target.hostname = url.hostname.replace(/^www\./, "");
      return Response.redirect(target.toString(), 301);
    }

    // ── ONE URL PER PAGE ────────────────────────────────────────────────────
    // routeFromPathname() strips trailing slashes before matching, which is kind
    // to a visitor who types one but meant that /products and /products/ BOTH
    // returned 200 with identical content — two URLs for one page, which is what
    // Search Console reports as "duplicate without user-selected canonical".
    // The no-slash form wins: it is what the sitemap lists and what pathForPage()
    // generates, so redirecting the other way would fight every internal link.
    //
    // Deliberately narrow:
    //  • "/" is exempt — the root's slash is not a trailing slash.
    //  • GET/HEAD only. A 301 on a POST invites the client to re-issue it as GET
    //    and silently drop the body; /api/* is excluded outright for the same
    //    reason, and its 404 handler is a better answer than a redirect anyway.
    //  • search is carried over, so /products/?family=awning keeps its query.
    // Placed first so nothing downstream can answer 200 before it runs.
    const method = request.method;
    if ((method === "GET" || method === "HEAD") &&
        url.pathname.length > 1 && url.pathname.endsWith("/") &&
        !url.pathname.startsWith("/api/")) {
      const target = new URL(url);
      target.pathname = url.pathname.replace(/\/+$/, "");
      return Response.redirect(target.toString(), 301);
    }

    // Real static assets (hashed js/css/img, etc.) are served directly, and never
    // wait on the catalogue. Anything else is a client-side route → serve the
    // host's SPA shell. The ops console is a separate bundle on ops.* (guarded by
    // Cloudflare Access in prod); we pick the shell up front because the asset
    // system maps "/" to index.html.
    // Crawler-facing files are GENERATED, not static, so they must be handled
    // before the asset check — both end in an extension and would otherwise be
    // looked up in the bundle and 404.
    // ── /r/<CODE> — the referral link ───────────────────────────────────────
    // Sits here, ahead of the asset check and the SPA shell, because it is a
    // worker-level redirect rather than a client route: the cookie has to be set
    // by the server, and a code containing a dot would otherwise look like an
    // asset.
    //
    // It redirects identically whatever the code is. Recording happens later, at
    // signup, and only for an account that did not already exist (AC-7) — so a
    // stranger clicking a link, or inventing one, cannot learn anything from the
    // response and cannot cause anything to be written.
    const referralLink = /^\/r\/([A-Za-z2-9]{3}-[A-Za-z2-9]{3})$/.exec(url.pathname);
    if (referralLink && (request.method === "GET" || request.method === "HEAD")) {
      const code = referralLink[1].toUpperCase();
      const known = await env.DB
        .prepare("SELECT 1 AS ok FROM user WHERE referral_code = ?")
        .bind(code)
        .first<{ ok: number }>();
      const headers = new Headers({ Location: "/refer" });
      // ONE PER MEMBER, and they get pasted into WhatsApp, Facebook groups and
      // forums — precisely where crawlers harvest links. A 302's source URL is
      // usually not indexed, but "usually" is not a control.
      //
      // Deliberately NOT disallowed in robots.txt: a disallow prevents crawling,
      // so this header would never be fetched, and a widely-shared blocked URL can
      // still land in the index with no content at all. A directive has to be seen
      // to be obeyed.
      headers.set("X-Robots-Tag", "noindex");
      if (known) {
        const attrs = [`of_ref=${code}`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=7776000"];
        if (env.APP_ENV === "production") attrs.push("Secure");
        headers.set("Set-Cookie", attrs.join("; "));
      }
      return new Response(null, { status: 302, headers });
    }

    const isOps = host.startsWith("ops.");
    if (!isOps && url.pathname === "/sitemap.xml") {
      await ensureCatalogue(env);           // products come from the live catalogue
      return buildSitemap(env, url.origin);
    }
    if (!isOps && url.pathname === "/robots.txt") return buildRobots(url.origin, env.APP_ENV === "production");

    const isAsset = /\.[a-zA-Z0-9]+$/.test(url.pathname) && !url.pathname.endsWith(".html");
    if (isAsset) return env.ASSETS.fetch(request);

    // The liveness probe must stay cheap — it also never waits on Sanity.
    if (url.pathname === "/api/health") return api.fetch(request, env, ctx);

    // Load the catalogue from Sanity once per isolate (no-op unless configured),
    // so pricing + snapshots use live content. Cheap after the first request, and
    // time-bounded so a slow CMS can't stall the response (see ensureCatalogue).
    await ensureCatalogue(env);

    if (url.pathname.startsWith("/api/")) {
      return api.fetch(request, env, ctx);
    }

    const shell = isOps ? "/ops.html" : "/index.html";
    const res = await env.ASSETS.fetch(new URL(shell, url.origin).toString());

    // Rewrite the customer shell's <head> for this URL. The SPA injects its own
    // tags after hydration, but social scrapers read the first response and never
    // run JS — so without this, every shared link previews as the build-time
    // placeholder. Failure here must never cost the page: fall back to the shell.
    if (isOps) return res;
    try {
      // The status comes back with the head because both are decided from one
      // route resolution. An unknown path, an unknown product or post slug, and a
      // product withdrawn from sale all serve the SPA shell — the client renders
      // its 404 page — but with a 404 STATUS. Serving that page behind a 200 is a
      // soft 404: the URL stays indexable and every mistyped address becomes a
      // duplicate of whatever it landed on.
      const { html, status } = await renderShell(env, await res.text(), url);
      return new Response(html, { status, headers: res.headers });
    } catch (e) {
      console.log(`[shell] head render failed: ${String(e)}`);
      return env.ASSETS.fetch(new URL(shell, url.origin).toString());
    }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.hostname;
    return applySecurity(await route(request, env, ctx), securityOptions(env, url, host));
  },
  async queue(batch: MessageBatch<AiExtractionJob>, env: Env): Promise<void> {
    await consumeAiJobs(batch, env);
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await drainLearningOutbox(env, 50);
    // Sweep for pricing gaps, so a missed publish webhook cannot hide one
    // indefinitely. Caught separately: neither job may sink the other.
    await reconcilePricing(env).catch((e) => console.log(`[reconcile] scheduled sweep failed: ${String(e)}`));
    // Release referral money held because its referrer was briefly unpayable.
    // Caught separately like its peers: a referral sweep must not sink pricing
    // reconciliation, and vice versa.
    await referralSweep(env).catch((e) => console.log(`[referral] scheduled sweep failed: ${String(e)}`));
    // Release AI jobs whose worker died mid-run; without this a customer sits
    // on "reading your documents" until they clear their own project.
    await reapAbandonedAiJobs(env)
      .then((n) => { if (n.claims || n.runs) console.log(`[ai] reaped ${n.claims} claim(s), ${n.runs} run(s)`); })
      .catch((e) => console.log(`[ai] reaper failed: ${String(e)}`));
  },
};
