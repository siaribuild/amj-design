# Deploy runbook — OpenFrame (Cloudflare)

Internal infrastructure codename: **apertly**. Public branding is **OpenFrame**.

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
npx wrangler d1 create apertly-db            # -> copy "database_id"
npx wrangler kv namespace create apertly-kv  # -> copy "id"
npx wrangler r2 bucket create apertly-files
```
Paste the returned ids into `wrangler.jsonc`:
- `d1_databases[0].database_id`  ← D1 id
- `kv_namespaces[0].id`          ← KV id
- (R2 needs only the bucket name, already set to `apertly-files`)

## 2. Apply migrations to the remote DB
```bash
npm run db:migrate:remote   # wrangler d1 migrations apply apertly-db --remote
```
Optionally seed demo data remotely (skip for a clean prod DB):
```bash
npx wrangler d1 execute apertly-db --remote --file scripts/db/seed.sql
```

## 3. Secrets & vars
```bash
# Email (Resend) — key is a SECRET, never committed:
npx wrangler secret put RESEND_API_KEY
# then in wrangler.jsonc vars, set the verified From address:
#   "EMAIL_FROM": "OpenFrame <quotes@openframe.com.au>"
```
Runtime env: `npm run cf:deploy` deploys with `APP_ENV=production` automatically
(`wrangler deploy --var APP_ENV:production`), which gates the dev-only OTP `devCode`
and sets `Secure` cookies. No manual flip is required — but a bare `wrangler deploy`
would ship the development default, so always deploy via `cf:deploy` (or pass the
`--var APP_ENV:production` yourself). Without a `RESEND_API_KEY`, sign-in emails are
dropped (never logged) outside development, so configure Resend before going live.

## 4. Custom domains
Point the app + ops console at your domain (Cloudflare dashboard → Workers → the
Worker → Settings → Domains & Routes, or `wrangler.jsonc` `routes`):
- `www.openframe.com.au`  (or apex) → customer site
- `ops.openframe.com.au`  → ops console (the Worker routes by Host: `ops.*`)

## 5. Cloudflare Access on ops.* (staff auth in prod)
The Worker already verifies Access JWTs when `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`
are set (see `worker/lib/staff.ts`). Configure Access:
1. Zero Trust dashboard → **Access → Applications → Add** → *Self-hosted*.
2. Application domain: `ops.openframe.com.au`.
3. Identity provider: your workforce IdP (Google Workspace, Entra, Okta…), with
   **MFA/passkey** enforced; add device-posture rules if desired.
4. Policy: allow your staff (e.g. emails ending `@openframe.com.au`), plus a
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
curl https://www.openframe.com.au/api/health
# ops.* should now be gated by Access; signing in with a staff IdP account lands
# on the console. Customer OTP emails should arrive via Resend.
```

## Staff roles (RBAC)
Internal users are created with **no role** on first sign-in. A role
(`estimator` / `technical_reviewer` / `manager` / `admin`) is required to record
payments (manager/admin only), advance orders, or read customer PII/files; admins
assign roles from the ops **Admin → Staff** screen. On a clean prod DB (no seed),
bootstrap by seeding one admin, e.g.:
```bash
npx wrangler d1 execute apertly-db --remote --command \
  "UPDATE user SET type='internal', role='admin' WHERE email='you@openframe.com.au'"
```
(The user row appears after that person signs in once via Access.)

## Notes
- `npm run cf:deploy` sets `APP_ENV=production`, which disables the dev OTP
  `devCode` in responses and adds `Secure` to cookies. A raw `wrangler deploy`
  ships the development default — prefer `cf:deploy`.
- Rollback: `wrangler deployments list` / `wrangler rollback`.
- Migrations are append-only; never edit an applied migration — add a new one.
