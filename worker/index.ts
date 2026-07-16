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

// Any other /api/* path is a real 404 — never fall through to the SPA shell.
api.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return api.fetch(request, env, ctx);
    }

    // Static asset, or SPA fallback to index.html for client-side routes.
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) return res;
    return env.ASSETS.fetch(new URL("/index.html", url.origin).toString());
  },
};
