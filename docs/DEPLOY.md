# Deploy runbook — OpenFrame (Cloudflare)

Internal infrastructure codename: **apertly**. Public branding is **OpenFrame**.

This is the only deploy runbook. It absorbed `PRODUCTION-DEPLOYMENT-VALIDATED.md`,
which had drifted three weeks and ~360 commits out of date — it still opened
"release status: blocked" over eight blockers that are all closed or were
deliberately decided against, and it prescribed a bootstrap procedure the code
pre-empts. Keeping two runbooks that disagreed was worse than either alone.

Everything here runs against **your** Cloudflare account, so you run the
authenticated commands. Run from the repo root.

## 0. Authenticate
```bash
npx wrangler login
```
```bash
npx wrangler whoami
```
Confirm the account id matches the intended production account before anything
below writes to it.

## 1. Create the resources
```bash
npx wrangler d1 create apertly-db
```
```bash
npx wrangler kv namespace create apertly-kv
```
```bash
npx wrangler r2 bucket create apertly-files
```
The AI extraction pipeline is a queue consumer with a dead-letter queue, both
declared in `wrangler.jsonc`. A deploy fails if they do not exist:
```bash
npx wrangler queues create apertly-ai-jobs
```
```bash
npx wrangler queues create apertly-ai-jobs-dlq
```
Paste the returned ids into `wrangler.jsonc`:
- `d1_databases[0].database_id` ← D1 id
- `kv_namespaces[0].id` ← KV id
- R2 needs only the bucket name, already set to `apertly-files`

Also bound in `wrangler.jsonc` and needing no provisioning: the Workers **AI**
binding, and a `*/10 * * * *` cron that drains the learning outbox, reconciles
pricing and reaps abandoned AI jobs.

## 2. Apply migrations to the remote DB
```bash
npm run db:migrate:remote
```
Migrations are append-only. Never edit an applied migration — add a new one.

Do **not** seed a production database: `scripts/db/seed.sql` creates demo
customers, orders and two named admin accounts.

`npm run db:reset -- --remote` **empties the deployed database** and reloads
those fixtures. It asks for a typed confirmation and refuses without a terminal,
but there is no undo beyond a D1 Time Travel restore — see §9.

## 3. Secrets and variables
Secrets are set with `wrangler secret put` and never committed:

| Secret | Needed for | Without it |
| --- | --- | --- |
| `RESEND_API_KEY` | all outbound email | emails are dropped, never logged |
| `TURNSTILE_SECRET` | contact form + customer sign-in captcha | captcha checks are skipped |
| `SCAN_ENDPOINT` / `SCAN_AUTH` | external AV (§7) | structural scanning only |
| `SANITY_WEBHOOK_SECRET` | catalogue cache invalidation on publish | webhook rejected |
| `PARSE_SUBJECT_SECRET` | schedule-parse subject tokens | — |
| `THERMAL_DEBUG_KEY` | the gated thermal debug endpoint | endpoint disabled |

```bash
npx wrangler secret put RESEND_API_KEY
```

`APP_ENV` is already `production` in `wrangler.jsonc`, and `npm run cf:deploy`
passes `--var APP_ENV:production` as well. It gates the dev-only OTP `devCode`
and sets `Secure` cookies. Deploy via `cf:deploy` rather than a bare
`wrangler deploy`.

Verify before a release that these `vars` are right for the environment:
`STAFF_EMAIL_DOMAINS`, `MANUFACTURER_EMAIL_DOMAINS` (see §5 — currently unset),
`EMAIL_FROM`, `ENQUIRY_INTERNAL_TO`, `MANUFACTURER_TO`, `SANITY_PROJECT_ID`,
`SANITY_DATASET`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `SCAN_ENGINE`,
`PARSE_ENGINE`, `AI_GATEWAY_ID`, `AI_EXTRACTION_MODE`.

## 4. Email (Resend)
1. Add a sending domain or subdomain in Resend.
2. Publish the exact SPF and DKIM records it supplies, in Cloudflare DNS.
3. Wait until Resend reports the domain `verified`.
4. Create a **Sending access** key restricted to that domain — not a full-access key.
5. Choose a From address at that domain which can receive replies, and set
   `EMAIL_FROM` to it.

## 5. Custom domains
Cloudflare dashboard → Workers → the Worker → Settings → Domains & Routes:
- `openframe.com.au` (apex) → customer site. `www.*` 301s to the apex.
- `ops.openframe.com.au` → ops console. The Worker picks the shell by `Host:`.

**Both hostnames reach the same Worker and the same `/api` router.** Host only
selects which SPA shell is served — it is not an API boundary. This matters for
§6.

## 6. Cloudflare Access on ops.* — this IS the privilege boundary
1. Zero Trust → **Access → Applications → Add** → *Self-hosted*.
2. Application domain: `ops.openframe.com.au`.
3. Identity provider: your workforce IdP, with **MFA/passkey** enforced.
4. Policy: **name the individual staff identities or an IdP group.** Prefer that
   over an email-domain suffix — read the next paragraph before deciding.
5. Copy the application **AUD** tag and your **team domain** into `wrangler.jsonc`:
   ```
   "ACCESS_TEAM_DOMAIN": "<your-team>",
   "ACCESS_AUD": "<application-aud-tag>"
   ```
6. Confirm the application is deny-by-default and test a non-staff identity.

**Access membership is the whole of the privilege model.** Internal roles are
flat by owner decision of 2026-07-28 (`worker/routes/ops.ts`, commit `d5e515e3`).
Every identity the Access policy admits is auto-provisioned on its first request
and can immediately read customer PII, download customer files, edit rate cards
and the deposit percentage, move workflow, and record payments. The only
in-app role distinction is `admin`, which gates two things: assigning roles, and
changing a customer's sign-in email. `estimator` / `technical_reviewer` /
`manager` are labels and grant nothing over having no role at all.

So the Access policy is not a first line of defence with application checks
behind it. **It is the line.** Scope it narrowly.

The one boundary the application does enforce is `MANUFACTURER_EMAIL_DOMAINS`:
identities on those domains reach the enquiry surface and nothing else, checked
per endpoint and covered by tests. **It is currently unset in `wrangler.jsonc`,
so nobody is classified as a partner.** Set it before admitting a manufacturer.

Once both Access variables are set, the Worker requires a valid
`Cf-Access-Jwt-Assertion` and the ops email-OTP fallback is switched off
entirely — the sign-in routes return 404. That is deliberate: the OTP routes are
served on every hostname, so leaving them live would have been an Access-free
way to write into the staff table. The fallback exists for local and staging
only. If Access is ever misconfigured, recovery is `wrangler d1 execute --remote`,
not an in-app back door.

### First administrator
The first internal user to arrive through Access is promoted to admin
automatically, and that self-heals if a role-less staffer is the only one there.
Once any admin exists, later staff start role-less — which, given flat access,
changes almost nothing about what they can do.

The last admin cannot be demoted (409 `last_admin`); promote a replacement first.

To check who holds it:
```bash
npx wrangler d1 execute apertly-db --remote --command "SELECT email, role FROM user WHERE type='internal' AND role='admin'"
```

## 7. Upload scanning
`SCAN_ENGINE` is `structural`: an on-stack type allowlist by sniffed bytes plus
PDF active-content detection. It reads the whole file, refuses anything that is
not a PDF, image or text document, and refuses a container hidden inside
something that looks textual. It is **not** anti-virus and has no signature
database.

For known-malware coverage, provision an AV service, then:
```bash
npx wrangler secret put SCAN_AUTH
```
Set `SCAN_ENDPOINT` and `SCAN_ENGINE` to `both` in `wrangler.jsonc`. Validate
end-to-end with the EICAR test string: the upload must return 422 and store
nothing. `remote` and `both` behave identically — both run the structural pass
first, so AV is additive and never replaces the type allowlist.

## 8. Build, deploy, smoke test
```bash
npm test
```
```bash
npm run cf:deploy
```
```bash
curl https://openframe.com.au/api/health
```
Then confirm by hand:
- the customer site loads, and a sign-in code arrives by email;
- `ops.openframe.com.au` challenges via Access and lands on the console;
- a non-staff identity is refused by Access;
- the contact form submits and returns an `OF-ENQ-` reference;
- responses carry the security headers (`curl -I`), and the CSP ships
  `Content-Security-Policy-Report-Only` until it is switched to enforcing in
  `worker/lib/headers.ts`.

## 9. Rollback and recovery
Worker code and config:
```bash
npx wrangler deployments list
```
```bash
npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --message "rollback: <REASON>"
```
A rollback creates a new deployment of the selected version. It does **not** roll
back D1, KV, R2 or Sanity.

D1 — overwrites the database in place and cancels in-flight queries, so get
incident approval first:
```bash
npx wrangler d1 time-travel info apertly-db --timestamp "<RFC3339_TIMESTAMP>"
```
```bash
npx wrangler d1 time-travel restore apertly-db --bookmark "<BOOKMARK>"
```
Record the undo bookmark the restore returns. Retention depends on the plan.

R2 and KV are not covered by a Worker rollback: uploaded files, sessions and OTP
state need their own retention procedure. Sanity content is independent again —
restore only from a verified export.

## References
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Access self-hosted applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Sanity CORS](https://www.sanity.io/docs/content-lake/cors)
- [Resend domains](https://resend.com/docs/dashboard/domains/introduction)
- [Resend API-key permissions](https://resend.com/docs/dashboard/api-keys/introduction)
