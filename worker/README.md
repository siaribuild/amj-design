# AMJ Worker (API tier)

Cloudflare Worker (Hono) that serves `/api/*` and falls back to the built Vite
SPA for everything else. Backend for the customer CPQ journey — see
[../docs/customer-backend-scaffold.md](../docs/customer-backend-scaffold.md).

## Layout
- `index.ts` — entry: routes `/api/*` to Hono, else serves `./dist` via `ASSETS`.
- `types.ts` — `Env` bindings (DB / FILES / KV / ASSETS / APP_ENV).
- `../migrations/` — D1 schema migrations.
- `../wrangler.jsonc` — bindings + config.

## First-time setup (real Cloudflare resources)
Local dev works with the placeholder ids in `wrangler.jsonc`. Before deploying,
create the resources and paste the returned ids into `wrangler.jsonc`:

```bash
npx wrangler login
npx wrangler d1 create amj-db          # -> database_id
npx wrangler kv namespace create amj-kv # -> id
npx wrangler r2 bucket create amj-files
```

## Local development
```bash
npm install
npm run db:migrate:local     # apply migrations to the local D1
npm run dev:api              # wrangler dev  -> http://localhost:8787
npm run dev                  # vite (separate terminal); /api proxies to :8787
```

Smoke test:
```bash
curl http://localhost:8787/api/health
curl http://localhost:8787/api/auth/me
```

## Deploy
```bash
npm run db:migrate:remote    # once resources exist
npm run cf:deploy            # vite build + wrangler deploy
```

## Milestones
M1 Rails (this) · M2 anon persistence · M3 registered + OTP · M4 submit→order ·
M5 delivery + guest + files. Tracked in the scaffold plan.
