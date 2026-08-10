# Local regression tests

The automated suite uses Node's built-in test runner and isolated local Cloudflare resources. It does not read or mutate the normal `.wrangler` development database.

## Commands

- `npm test` runs the complete backend + logic regression suite (no browser needed).
- `npm run test:all` also runs the browser E2E suite (`test:web`).
- `npm run test:unit` — pure-logic units: pricing, schedule codes, option groups,
  formatting, and the Worker's pure helpers (cookies, tokens, email/OTP utils,
  order transitions, staff allowlist, catalogue normalization).
- `npm run test:catalogue` validates catalogue hydration, the shared GROQ shape, and the generated Sanity NDJSON.
- `npm run test:build` builds both Vite entry points and performs a Wrangler deployment dry run.
- `npm run test:api` creates a fresh D1 database, applies every migration, seeds it, starts a local Worker, and exercises API, KV, R2, authentication, approval, quote, order, guest-tracking, and SPA-routing flows — happy paths (`api.test.mjs`, which also pins the security-header policy) and edge/negative paths (`api-edge.test.mjs`: OTP caps and per-source throttling, the Access-mode ops sign-in guard — which boots a second Worker with the Access variables actually set — last-admin protection, enquiry reference sequencing across a deleted row, guest anti-enumeration, file limits/ownership, upload-scanner refusals, the clarification round-trip, flat-access verification, audit, customers 360, search, order stage-conflicts).
- `npm run test:web` — Playwright E2E against a real built Worker (customer site + `ops.*` console): OTP login, real dashboard data, products catalogue, guest tracking, and the ops queue/workspace/tabs.
- `npm run test:coverage` — c8 line/branch/function coverage for the in-process logic layer (pure functions in `src/data/**` + `worker/lib/**`), via esbuild inline source maps. HTML report in `coverage/`. Integration/Worker-route and E2E code run in separate processes (wrangler/workerd, the browser) so they are covered behaviourally, not line-instrumented, by design.

## Browser E2E prerequisites

`test:web` needs the Playwright browser installed once:

```
npm install            # brings in @playwright/test
npm run test:web       # uses the system Chrome/Edge by default (no download)
# or, to use Playwright's bundled chromium instead:
#   npx playwright install
#   PLAYWRIGHT_CHANNEL= npm run test:web
```

By default the config drives the **system Chrome** (`channel: "chrome"`), so no
browser download is needed on a machine that has Chrome or Edge. Set
`PLAYWRIGHT_CHANNEL=msedge` to use Edge, or clear it (after `npx playwright
install`) to use the bundled chromium.

The E2E web server (`scripts/tests/web-server.mjs`) builds + seeds isolated local
resources under `.codex-tmp/` and serves them on a fixed port; specs live in
`scripts/tests/web/`. If the browser binary isn't available (e.g. a locked-down
CI image), `test:web` is skipped by not being part of `npm test`.

Temporary build and database state is created beneath `.codex-tmp/` and removed after each run. The API suite uses development OTPs returned by the local Worker; it never sends email or talks to production services.

## The type-check gate

`npm test` begins with `typecheck:gate`, which fails on a named set of error codes
— the ones that mean code cannot run at all — and prints the remaining backlog as
a per-code table on every run. `npm run typecheck` reports everything and exits 0.

The subset is a ratchet, not a standing compromise: fix a code's last occurrence,
add it to `FATAL` in `scripts/typecheck.mjs`, and it can never return. Treat a
growing count as a real signal rather than noise — two live defects were found
sitting in the ungated backlog, an estimator flag that never reached the module
that reads it, and three input fields that had silently lost Enter-to-submit and
autofocus.

## Known-issue regressions

None. This section used to list three defects kept as executable `todo` tests, and
all three are gone — there is no `todo` annotation left anywhere in
`scripts/tests/`. The approval-delegation item went with the approvals engine
itself (migration 0033), and the legacy staff seam is an ordinary passing
assertion now.

## Still environment-dependent

The suite cannot validate a real Sanity project, Cloudflare Access, Resend delivery, or deployed Cloudflare bindings without those services and credentials. Browser interaction is now covered by the Playwright E2E suite (`test:web`, see above), which drives the real customer and ops UIs; it requires the Playwright browser (`npx playwright install`). Responsive/visual-diff checks remain out of scope.
