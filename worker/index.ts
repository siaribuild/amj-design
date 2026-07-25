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
import { consumeAiJobs, type AiExtractionJob } from "./lib/ai/jobs";
import { auth } from "./routes/auth";
import { projects } from "./routes/projects";
import { quote } from "./routes/quote";
import { orders } from "./routes/orders";
import { guest } from "./routes/guest";
import { files } from "./routes/files";
import { enquiries } from "./routes/enquiries";
import { parse } from "./routes/parse";
import { ops } from "./routes/ops";
import { integrations } from "./routes/integrations";
import { ensureCatalogue } from "./lib/catalogue";
import { getActiveLocations } from "../src/data/catalogue";
import { drainLearningOutbox } from "./lib/revisions";

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

// Quote lifecycle: submit / issue-revision / revisions / accept.
api.route("/api", quote);

// Order tracking, customer sign-off gates, and staff fulfilment seams.
api.route("/api/orders", orders);

// Anonymous read-only order tracking (email + reference, two-step).
api.route("/api/guest", guest);

// File uploads/downloads (R2): /api/files/*, /api/projects/:id/files.
api.route("/api", files);

// Public Contact-page enquiries (question / showroom appointment).
api.route("/api", enquiries);

// Schedule upload → parse into estimator draft lines (quota-limited).
api.route("/api", parse);

// Internal ops console API (staff-gated).
api.route("/api/ops", ops);

// Inbound webhooks (Sanity publish → catalogue cache invalidation).
api.route("/api/integrations", integrations);

// Any other /api/* path is a real 404 — never fall through to the SPA shell.
api.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Real static assets (hashed js/css/img, etc.) are served directly, and never
    // wait on the catalogue. Anything else is a client-side route → serve the
    // host's SPA shell. The ops console is a separate bundle on ops.* (guarded by
    // Cloudflare Access in prod); we pick the shell up front because the asset
    // system maps "/" to index.html.
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

    const host = request.headers.get("host") ?? url.hostname;
    const shell = host.startsWith("ops.") ? "/ops.html" : "/index.html";
    return env.ASSETS.fetch(new URL(shell, url.origin).toString());
  },
  async queue(batch: MessageBatch<AiExtractionJob>, env: Env): Promise<void> {
    await consumeAiJobs(batch, env);
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await drainLearningOutbox(env, 50);
  },
};
