# Code review audit — 10 August 2026

## Scope

- **Reviewed revision:** `cc3d959e` — `fix(footer): the one sign-in control that survived signing in`
- **Branch:** local `main`, tracking `apertly/main`
- **Method:** static architecture, security, data-integrity, deployment, Sanity, and regression-suite review.
- **Excluded:** live Cloudflare, Resend, Sanity, DNS, and access-policy state. This audit records what is reproducible from the local repository.

No application code was changed while preparing this audit.

## Findings

### P1 — Admin bootstrap trusts the first eligible mailbox

On a new or re-initialised production database, the first allowlisted email to sign in is made an administrator. The existence check and promotion are separate operations, so concurrent initial sign-ins can race. This is particularly important after a production reseed.

- Evidence: `worker/lib/staff.ts` (`bootstrapAdmin()` and `findOrCreateInternalUser()`)
- Configuration: `STAFF_EMAIL_DOMAINS` is `openframe.com.au` in `wrangler.jsonc`.
- Recommendation: provision one named bootstrap administrator out of band and make the bootstrap claim atomic; do not grant administration from a broad email-domain rule.

### P1 — Direct ops access conflicts with the checked-in Access configuration

When both `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are configured, the Worker deliberately ignores the OTP/session fallback and requires a valid `Cf-Access-Jwt-Assertion`. Removing Cloudflare Access at the edge while retaining those variables makes the ops console fail closed with a 401/403 response.

- Evidence: `worker/lib/staff.ts` (`resolveInternalUser()`)
- Configuration: `wrangler.jsonc` includes both Access variables.
- Recommendation: restore and enforce Cloudflare Access, or intentionally remove both variables and accept the weaker email-OTP fallback only with a reviewed replacement control.

### P1 — Internal access is effectively flat

Most operations endpoints accept every authenticated internal user who is not a manufacturer partner, including role-less users. That includes customer data, pricing, workflow moves, and payment actions. The named role values do not provide the restrictions described in parts of the deployment documentation.

- Evidence: `worker/routes/ops.ts` (`isStaffUser` / `hasAssignedRole`) and `worker/routes/ops-pricing.ts`.
- Recommendation: either treat Cloudflare Access membership as the sole, tightly controlled privileged boundary, or implement endpoint-level least-privilege role checks.

### P2 — Structural upload scanning is not malware scanning

The production setting uses the on-stack structural scanner. It verifies file signatures and screens selected PDF active-content features, but it cannot identify known malware. Files that pass are marked `clean` and become downloadable to staff.

- Evidence: `wrangler.jsonc` (`SCAN_ENGINE: "structural"`) and `worker/lib/scan/structural.ts`.
- Recommendation: deploy a vetted AV service and configure `SCAN_ENGINE=both` with `SCAN_ENDPOINT` and `SCAN_AUTH` before enabling production uploads.

### P2 — OTP sends lack a source-based abuse control

Customer and ops OTP challenge endpoints only limit per recipient address. A bot can rotate recipient addresses to create email volume, cost, and sender-reputation risk. Neither challenge uses Turnstile nor a source/IP throttle.

- Evidence: `worker/routes/auth.ts`, `worker/routes/ops.ts`, and `worker/lib/auth.ts` (`challengeAllowed`).
- Recommendation: add an IP/device rate limit and CAPTCHA/Turnstile protection before issuing OTPs.

### P2 — No reproducible security-header policy for the SPA or ops shell

The repository defines safe headers for private file downloads, but not a general header policy for customer or ops HTML responses. There is no application-configured CSP, anti-framing policy, HSTS, Permissions Policy, or general Referrer Policy.

- Evidence: `worker/index.ts` returns the static shell response headers unchanged.
- Recommendation: define and test the policy in version-controlled Worker code or Cloudflare configuration, including `frame-ancestors` for the ops console.

### P2 — Public reference generation is concurrency-prone

Project, enquiry, and order identifiers are derived from a current maximum/count and then inserted separately. A simultaneous request can select the same next value and lose on the unique constraint, returning an avoidable failure rather than retrying.

- Evidence: `worker/lib/access.ts`, `worker/routes/enquiries.ts`, and `worker/lib/orders.ts`.
- Recommendation: use an atomic sequence/allocation table or bounded retry on unique-conflict errors.

### P2 — The ordinary test gate permits 47 TypeScript errors

`npm run typecheck` reports 47 TypeScript errors. `npm test` runs a reduced gate that permits all errors outside a selected set of diagnostic codes. This allows type-contract regressions through the normal green test result.

- Evidence: `scripts/typecheck.mjs` and `package.json`.
- Recommendation: make a clean typecheck the release criterion, or introduce a zero-error ratchet for all changed files and their call sites.

### P3 — Deployment and testing documentation has drifted

The detailed production runbook still says the current release is blocked by historical issues, while the shorter deploy guide describes role restrictions that the current implementation does not enforce. The testing guide also says some known defects remain `TODO` tests, but the corresponding active checks have changed.

- Evidence: `docs/PRODUCTION-DEPLOYMENT-VALIDATED.md`, `docs/DEPLOY.md`, and `docs/testing.md`.
- Recommendation: consolidate the runbooks and align them with the current auth, deployment, and test behaviour before relying on them for production change control.

### P3 — Sanity build needs manual environment setup

The Sanity Studio typecheck succeeds. Its build succeeds only when `SANITY_STUDIO_PROJECT_ID` is supplied, because `sanity.cli.ts` requires it even though `sanity.config.ts` has a fallback project ID. The build also warns about a `styled-components` version mismatch with Sanity's requested version.

- Evidence: `sanity/sanity.cli.ts` and `sanity/package.json`.
- Recommendation: make the required environment variables explicit in the Studio build command/CI configuration and align the dependency version.

## Verification performed

| Check | Result |
| --- | --- |
| `npm audit --omit=dev --offline` | Passed; 0 vulnerabilities reported. |
| Root build and Wrangler dry-run (`test:build`) | Passed. |
| Root full typecheck | Completed with 47 reported errors; command is informational by design. |
| Unit, catalogue, scan, estimator, AI, schedule, composite, drawing, pairing, compatibility suites | Passing assertions observed. |
| API edge suite | All visible assertions passed; the process exceeded the environment's 60-second command limit during shutdown. |
| Main API integration suite | All visible assertions passed; the process exceeded the same 60-second command limit before final completion output. |
| Sanity Studio typecheck | Passed. |
| Sanity Studio build | Passed after providing project and dataset environment variables; emitted a `styled-components` compatibility warning. |

## Limits of local verification

The local suites intentionally do not validate deployed Cloudflare Access JWT delivery/policy, Cloudflare binding configuration, Resend delivery, live Sanity content/CORS, DNS, or production data. These require a controlled staging or production smoke-test checklist.

## Release recommendation

Do not treat this revision as a production-ready release until the P1 findings have an approved resolution and the P2 upload-scanning, OTP-abuse, security-header, and regression-gate risks are explicitly accepted or remediated.
