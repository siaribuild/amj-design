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
import { trade } from "./routes/trade";
import { parse } from "./routes/parse";
import { ops } from "./routes/ops";
import { opsReferrals } from "./routes/ops-referrals";
import { opsTrade } from "./routes/ops-trade";
import { integrations } from "./routes/integrations";
import { debug } from "./routes/debug";
import { buildSitemap, buildRobots, renderShell } from "./lib/shell";
import { ensureCatalogue } from "./lib/catalogue";
import { getActiveLocations } from "../src/data/catalogue";
import { isUnderOps2 } from "../src/data/ops2Routing";
import { drainLearningOutbox } from "./lib/issue";
import { reconcilePricing } from "./lib/pricing-admin";
import { referralSweep } from "./lib/referrals";
import { writeMonitoringSnapshot } from "./lib/monitoring";
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

// Trade verification (ABN / ABR) — the customer side. Session-scoped; no
// subject id exists on any endpoint here.
api.route("/api/trade", trade);

// Schedule upload → parse into estimator draft lines (quota-limited).
api.route("/api", parse);

// Internal ops console API (staff-gated).
api.route("/api/ops", ops);
api.route("/api/ops/referrals", opsReferrals);
api.route("/api/ops/trade", opsTrade);

// Inbound webhooks (Sanity publish → catalogue cache invalidation).
api.route("/api/integrations", integrations);

// Admin/debug-only, secret-key-gated (disabled unless THERMAL_DEBUG_KEY is set).
api.route("/api/debug", debug);

// Any other /api/* path is a real 404 — never fall through to the SPA shell.
api.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

// ── Shell selection — the one place the ops2 rollout is flipped ─────────────
//
// ┌─ WHERE THE DOCUMENTS ARE ────────────────────────────────────────────────┐
// │ Both sources below live ONLY on the `design/ops2-planning` branch today:  │
// │   docs/adr/0002-ops2-path-routing-not-hash.md   (cited here as "the       │
// │     routing ADR" — read it with `git show design/ops2-planning:<path>`)   │
// │   docs/specs/ops2.md §9, §12                                             │
// │                                                                          │
// │ Do NOT read this branch's docs/adr/0002-*.md as the routing decision: on  │
// │ this branch and on main, 0002 is                                         │
// │ `0002-trade-status-derived-from-application-ledger.md`, an unrelated ADR. │
// │ The two branches have colliding ADR numbers (0001 as well as 0002); the   │
// │ renumbering is the planning thread's to make. Until it does, the filename │
// │ is the citation and the number is not.                                    │
// └──────────────────────────────────────────────────────────────────────────┘
//
// The successor to `isOps ? "/ops.html" : "/index.html"`. The spec's §12 gives
// it three states, and each flip is a one-line, versions-revertible deploy
// (routing ADR) — `wrangler versions upload` for a preview that does not move
// production traffic, then `wrangler versions deploy` to promote:
//
//   1. BUILD (live now) — legacy at the ops root, ops2 reachable at /ops2.
//      Nobody's daily work moves.
//   2. SWITCH-OVER — ops2 at the root, legacy at /legacy: the fire escape,
//      unadvertised, used only if ops2 fails at something.
//   3. DELETION — legacy gone from the bundle, with its Vite entry and the
//      domain-based identity path.
//
// States 2 and 3 are written out as comments below, not implemented, and are
// deliberately one edit each. Switch-over and deletion are two events, two
// commits, two deploys, separated by a soak.
//
// AUTHENTICATION IS NOT INVOLVED. ops2 lives on the ops HOST, so Cloudflare
// Access protects it at the edge exactly as it protects the legacy console,
// and `isOps` still decides host-level behaviour on its own. That is the whole
// reason ops2 took a path prefix instead of a hostname (the spec's §9): a second
// hostname would need a second Access audience and a widened `isOps`, which is
// a security-path change for a cosmetic reason.
type Shell = "/index.html" | "/ops.html" | "/ops2.html";

export function opsShellFor(isOps: boolean, pathname: string): Shell {
  if (!isOps) return "/index.html";                       // the customer site, unchanged

  // ── State 1: BUILD ────────────────────────────────────────────────────────
  return isUnderOps2(pathname) ? "/ops2.html" : "/ops.html";

  // ── State 2: SWITCH-OVER ──────────────────────────────────────────────────
  // return pathname === "/legacy" || pathname.startsWith("/legacy/")
  //   ? "/ops.html" : "/ops2.html";

  // ── State 3: DELETION ─────────────────────────────────────────────────────
  // return "/ops2.html";
}

// Route a request to its response. Every `return` below is a page or a payload;
// the security policy is attached once, by the fetch handler that wraps this.
// There are nine exits here — two redirects, sitemap, robots, static assets, the
// API, the ops2 shell, the ops shell, the customer shell and the shell-render
// fallback — and before the wrapper existed, every one of them answered with no
// policy at all. Adding an exit means adding it to that wrapper's blast radius,
// which is why the count is written down: an exit nobody counted is an exit
// nobody checked.
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

    // An /api/ path is never a file in the bundle. Without that exclusion any API
    // route whose last segment carries an extension — the payout CSV export, and
    // anything like it later — is looked up as a static asset and 404s before it
    // reaches a handler, which reads as "the route isn't registered" and is not.
    const isAsset = !url.pathname.startsWith("/api/")
      && /\.[a-zA-Z0-9]+$/.test(url.pathname) && !url.pathname.endsWith(".html");
    if (isAsset) return env.ASSETS.fetch(request);

    // The liveness probe must stay cheap — it also never waits on Sanity.
    if (url.pathname === "/api/health") return api.fetch(request, env, ctx);

    // The shell is chosen here, before hydration, because ONE of them needs to
    // be served before it: ops2 reads no catalogue.
    //
    // Everything else below stays behind ensureCatalogue and must: the API
    // serves live catalogue content, and the legacy console reads it too. Only
    // the ops2 exit moves in front, and it is the ops2 exit — not `isOps` —
    // that is tested, so switch-over and deletion carry it automatically.
    //
    // Why it matters more than a cold-start milliseconds argument: a failed
    // load is deliberately not cached (worker/lib/catalogue.ts), so while Sanity
    // is slow or down EVERY request pays the 3s timeout. Behind hydration, the
    // one screen whose job is to show that routing and Access work would be the
    // screen that looks broken during a CMS outage — which is exactly the
    // dependency src/ops2/main.tsx refuses on the client side.
    const shell = opsShellFor(isOps, url.pathname);
    if (shell === "/ops2.html") return env.ASSETS.fetch(new URL(shell, url.origin).toString());

    // Load the catalogue from Sanity once per isolate (no-op unless configured),
    // so pricing + snapshots use live content. Cheap after the first request, and
    // time-bounded so a slow CMS can't stall the response (see ensureCatalogue).
    await ensureCatalogue(env);

    if (url.pathname.startsWith("/api/")) {
      return api.fetch(request, env, ctx);
    }

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

// THE DURABLE OBJECT CLASS MUST BE REACHABLE FROM THE MAIN MODULE, or wrangler
// cannot bind it — and Cloudflare refuses any version that drops a class its
// live objects depend on, which is what blocked every deploy of this Worker
// after the plan-parse revert. The class itself is a held-open stub; see the
// file for why it is not deleted and why it no longer extends `Container`.
export { PlanParseContainer } from "./lib/drawing/PlanParseContainer";

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
    // Caught like every sweep below it. Unguarded, a throw here ended the whole
    // scheduled run, so the four jobs after it silently never happened — the
    // "neither job may sink the other" rule stated two lines down applied to
    // everything except the one that runs first.
    await drainLearningOutbox(env, 50).catch((e) => console.log(`[learning] outbox drain failed: ${String(e)}`));
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
    // ai-parse monitoring snapshot (design §5). Caught separately like its
    // peers above — a KV/D1 blip here must not sink the other sweeps.
    await writeMonitoringSnapshot(env).catch((e) => console.log(`[monitoring] scheduled snapshot failed: ${String(e)}`));
  },
};
