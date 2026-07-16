// ═══════════════════════════════════════════════════════════════════════════
// AMJ Trade Direct — API Worker (Hono)
//
// Serves /api/* from route handlers; everything else is the built Vite SPA via
// the ASSETS binding (with SPA fallback to index.html). This is the M1 "Rails"
// skeleton: health + auth/me only. Projects, auth OTP, orders, files land in
// later milestones (see docs/customer-backend-scaffold.md).
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from "hono";
import type { Env } from "./types";

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

// Who am I? M1 always returns anonymous. Session resolution (cookie -> KV -> user)
// and anon-project claiming land in M3.
api.get("/api/auth/me", (c) =>
  c.json({ authenticated: false, anonymous: true, user: null }),
);

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
