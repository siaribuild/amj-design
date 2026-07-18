# Local regression tests

The automated suite uses Node's built-in test runner and isolated local Cloudflare resources. It does not read or mutate the normal `.wrangler` development database.

## Commands

- `npm test` runs the complete local regression suite.
- `npm run test:catalogue` validates catalogue hydration, the shared GROQ shape, and the generated Sanity NDJSON.
- `npm run test:build` builds both Vite entry points and performs a Wrangler deployment dry run.
- `npm run test:api` creates a fresh D1 database, applies every migration, seeds it, starts a local Worker, and exercises API, KV, R2, authentication, approval, quote, order, guest-tracking, and SPA-routing flows.

Temporary build and database state is created beneath `.codex-tmp/` and removed after each run. The API suite uses development OTPs returned by the local Worker; it never sends email or talks to production services.

## Known-issue regressions

Confirmed defects are retained as executable `TODO` tests. They run and report their current failure without making the otherwise passing suite exit unsuccessfully:

- Sanity object-array members are missing `_key` values.
- An estimator can delegate an approval to the estimator role and self-approve.
- The legacy staff seam authorizes unauthenticated requests while `APP_ENV` is `development`.

Remove each `todo` annotation when its underlying defect is fixed; the existing assertion then becomes a required regression gate.

## Still environment-dependent

The suite cannot validate a real Sanity project, Cloudflare Access, Resend delivery, or deployed Cloudflare bindings without those services and credentials. Browser interaction and responsive visual checks remain manual because no browser-test dependency is currently installed; route fallback and built static assets are covered automatically.
