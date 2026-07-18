// ═══════════════════════════════════════════════════════════════════════════
// AMJ Trade Direct — API Worker (Hono)
//
// Serves /api/* from route handlers; everything else is the built Vite SPA via
// the ASSETS binding (with SPA fallback to index.html). Routes: health, auth
// (OTP), projects, quote lifecycle, orders. Files land in M5.
// See docs/customer-backend-scaffold.md.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from "hono";
import type { Env } from "./types";
import { auth } from "./routes/auth";
import { projects } from "./routes/projects";
import { quote } from "./routes/quote";
import { orders } from "./routes/orders";
import { guest } from "./routes/guest";
import { files } from "./routes/files";
import { ops } from "./routes/ops";
import { ensureCatalogue } from "./lib/catalogue";

const api = new Hono<{ Bindings: Env }>();

// Liveness + binding presence. Cheap probe for `wrangler dev` and deploys.
api.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "amj-trade-direct",
    env: c.env.APP_ENV ?? "unknown",
    bindings: { db: !!c.env.DB, files: !!c.env.FILES, kv: !!c.env.KV },
    time: new Date().toISOString(),
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

// Internal ops console API (staff-gated).
api.route("/api/ops", ops);

// Any other /api/* path is a real 404 — never fall through to the SPA shell.
api.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Load the catalogue from Sanity once per isolate (no-op unless configured),
    // so pricing + snapshots use live content. Cheap after the first request.
    await ensureCatalogue(env);

    if (url.pathname.startsWith("/api/")) {
      return api.fetch(request, env, ctx);
    }

    // Real static assets (hashed js/css/img, etc.) are served directly. Anything
    // else is a client-side route → serve the host's SPA shell. The ops console
    // is a separate bundle on ops.* (guarded by Cloudflare Access in prod); we
    // pick the shell up front because the asset system maps "/" to index.html.
    const isAsset = /\.[a-zA-Z0-9]+$/.test(url.pathname) && !url.pathname.endsWith(".html");
    if (isAsset) return env.ASSETS.fetch(request);

    const host = request.headers.get("host") ?? url.hostname;
    const shell = host.startsWith("ops.") ? "/ops.html" : "/index.html";
    return env.ASSETS.fetch(new URL(shell, url.origin).toString());
  },
};
