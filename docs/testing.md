# Local regression tests

The automated suite uses Node's built-in test runner and isolated local Cloudflare resources. It does not read or mutate the normal `.wrangler` development database.

## Commands

- `npm test` runs the complete backend + logic regression suite (no browser needed).
- `npm run test:all` also runs the browser E2E suite (`test:web`).
- `npm run test:unit` — pure-logic units: pricing, schedule codes, option groups,
  formatting, and the Worker's pure helpers (cookies, tokens, email/OTP utils,
  order transitions, approval RBAC, staff allowlist, catalogue normalization).
- `npm run test:catalogue` validates catalogue hydration, the shared GROQ shape, and the generated Sanity NDJSON.
- `npm run test:build` builds both Vite entry points and performs a Wrangler deployment dry run.
- `npm run test:api` creates a fresh D1 database, applies every migration, seeds it, starts a local Worker, and exercises API, KV, R2, authentication, approval, quote, order, guest-tracking, and SPA-routing flows — happy paths (`api.test.mjs`) and edge/negative paths (`api-edge.test.mjs`: OTP caps, guest anti-enumeration + rate limit, file limits/ownership, clarification round-trip, approval reject/wrong-role/no-rule, admin RBAC, audit, customers 360, search, order stage-conflicts).
- `npm run test:web` — Playwright E2E against a real built Worker (customer site + `ops.*` console): OTP login, real dashboard data, products catalogue, guest tracking, and the ops queue/workspace/tabs.

## Browser E2E prerequisites

`test:web` needs the Playwright browser installed once:

```
npm install            # brings in @playwright/test
npx playwright install # downloads the chromium headless shell
npm run test:web
```

The E2E web server (`scripts/tests/web-server.mjs`) builds + seeds isolated local
resources under `.codex-tmp/` and serves them on a fixed port; specs live in
`scripts/tests/web/`. If the browser binary isn't available (e.g. a locked-down
CI image), `test:web` is skipped by not being part of `npm test`.

Temporary build and database state is created beneath `.codex-tmp/` and removed after each run. The API suite uses development OTPs returned by the local Worker; it never sends email or talks to production services.

## Known-issue regressions

Confirmed defects are retained as executable `TODO` tests. They run and report their current failure without making the otherwise passing suite exit unsuccessfully:

- Sanity object-array members are missing `_key` values.
- An estimator can delegate an approval to the estimator role and self-approve.
- The legacy staff seam authorizes unauthenticated requests while `APP_ENV` is `development`.

Remove each `todo` annotation when its underlying defect is fixed; the existing assertion then becomes a required regression gate.

## Still environment-dependent

The suite cannot validate a real Sanity project, Cloudflare Access, Resend delivery, or deployed Cloudflare bindings without those services and credentials. Browser interaction is now covered by the Playwright E2E suite (`test:web`, see above), which drives the real customer and ops UIs; it requires the Playwright browser (`npx playwright install`). Responsive/visual-diff checks remain out of scope.
