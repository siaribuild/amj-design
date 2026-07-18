# Deploy runbook — AMJ Trade Direct (Cloudflare)

Everything here runs against **your** Cloudflare account, so you run the
authenticated commands. The app is deploy-ready; this is the checklist to stand
it up. Run from the repo root.

## 0. Authenticate
```bash
npx wrangler login          # opens a browser; authorises Wrangler to your account
npx wrangler whoami         # confirm the right account
```

## 1. Create the resources
```bash
npx wrangler d1 create amj-db            # -> copy "database_id"
npx wrangler kv namespace create amj-kv  # -> copy "id"
npx wrangler r2 bucket create amj-files
```
Paste the returned ids into `wrangler.jsonc`:
- `d1_databases[0].database_id`  ← D1 id
- `kv_namespaces[0].id`          ← KV id
- (R2 needs only the bucket name, already set to `amj-files`)

## 2. Apply migrations to the remote DB
```bash
npm run db:migrate:remote   # wrangler d1 migrations apply amj-db --remote
```
Optionally seed demo data remotely (skip for a clean prod DB):
```bash
npx wrangler d1 execute amj-db --remote --file scripts/db/seed.sql
```

## 3. Secrets & vars
```bash
# Email (Resend) — key is a SECRET, never committed:
npx wrangler secret put RESEND_API_KEY
# then in wrangler.jsonc vars, set the verified From address:
#   "EMAIL_FROM": "AMJ Trade Direct <quotes@amjtradedirect.com.au>"

# Flip the runtime env to production (gates dev-only OTP codes, sets Secure cookies):
#   wrangler.jsonc vars: "APP_ENV": "production"
```

## 4. Custom domains
Point the app + ops console at your domain (Cloudflare dashboard → Workers → the
Worker → Settings → Domains & Routes, or `wrangler.jsonc` `routes`):
- `www.amjtradedirect.com`  (or apex) → customer site
- `ops.amjtradedirect.com`  → ops console (the Worker routes by Host: `ops.*`)

## 5. Cloudflare Access on ops.* (staff auth in prod)
The Worker already verifies Access JWTs when `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`
are set (see `worker/lib/staff.ts`). Configure Access:
1. Zero Trust dashboard → **Access → Applications → Add** → *Self-hosted*.
2. Application domain: `ops.amjtradedirect.com`.
3. Identity provider: your workforce IdP (Google Workspace, Entra, Okta…), with
   **MFA/passkey** enforced; add device-posture rules if desired.
4. Policy: allow your staff (e.g. emails ending `@amjtradedirect.com.au`), plus a
   break-glass rule for a named admin.
5. Copy the application **AUD** tag and your **team domain**, then set in
   `wrangler.jsonc` vars:
   ```
   "ACCESS_TEAM_DOMAIN": "<your-team>",   // <team>.cloudflareaccess.com
   "ACCESS_AUD": "<application-aud-tag>"
   ```
Until this is set, staff sign-in falls back to the domain-allowlisted email OTP
(fine for staging; not for prod).

## 6. Build & deploy
```bash
npm run cf:deploy           # vite build (customer + ops bundles) + wrangler deploy
```

## 7. Smoke test
```bash
curl https://www.amjtradedirect.com/api/health
# ops.* should now be gated by Access; signing in with a staff IdP account lands
# on the console. Customer OTP emails should arrive via Resend.
```

## Notes
- `APP_ENV=production` disables the dev OTP `devCode` in responses and adds
  `Secure` to cookies — set it before going live.
- Rollback: `wrangler deployments list` / `wrangler rollback`.
- Migrations are append-only; never edit an applied migration — add a new one.
