# Production deployment runbook (validated copy)

Validated on **19 July 2026** against base application commit `73d6c053`, the
apertly infrastructure naming changes, Wrangler `4.111.0`, the installed CLI
help, and the current official Cloudflare, Sanity, and Resend documentation.
This remains the detailed, separately maintained production runbook;
`docs/DEPLOY.md` is the shorter legacy checklist.

The internal project and infrastructure codename is **apertly**. Infrastructure
resource names use that namespace; customer-facing branding is **OpenFrame**.

This runbook assumes PowerShell on Windows and that commands are run from the
repository root unless a step says otherwise. Replace every value in angle
brackets before running a command.

## Current release status: blocked

Do **not** deploy the current commit to production. The latest code review found
release-blocking issues that deployment configuration cannot compensate for:

- development OTPs can expose/create staff access if `APP_ENV` is wrong;
- quote submissions can discard contact data and report false success;
- revision acceptance and order creation are not one atomic operation;
- non-draft projects can be edited/resubmitted and incomplete projects can be
  issued as zero-value orders;
- OTP issuance lacks production abuse controls;
- operational, financial, and customer-data endpoints lack complete role gates;
- anonymous file uploads have no quota/quarantine enforcement; and
- Cloudflare Access verification does not yet fail closed.

Proceed beyond the release gate only after those findings are fixed, covered by
regression tests, peer-reviewed, and committed. A production deployment should
start from an identified commit, not an uncommitted working tree.

## 1. Record the production inputs

Agree and record these values in the release ticket/change record:

| Input | Required value |
| --- | --- |
| Release commit | `<FULL_GIT_SHA>` |
| Cloudflare account | `<ACCOUNT_NAME_OR_ID>` |
| Customer host | `<CUSTOMER_HOST>` |
| Ops host | `<OPS_HOST>`; it **must begin with `ops.`** because host routing depends on that prefix |
| Staff email domain(s) | `<STAFF_DOMAIN>`; comma-separated if more than one |
| Worker | `apertly` |
| D1 database | `apertly-db` |
| KV namespace | `apertly-kv` |
| R2 bucket | `apertly-files` or an approved `apertly-*` variant if unavailable |
| Resend From address | `OpenFrame <quotes@<VERIFIED_SENDING_DOMAIN>>` |
| Cloudflare Access team name | `<ACCESS_TEAM_NAME>` only, without `.cloudflareaccess.com` |
| Cloudflare Access application AUD | `<ACCESS_APPLICATION_AUD>` |
| Sanity project ID | `<SANITY_PROJECT_ID>` or `disabled` |
| Sanity dataset | normally `production` |

Resolve the current `.com` versus `.com.au` inconsistency before deployment.
Do not infer the public website domain from the staff email domain.

## 2. Pass the release gate

From the repository root:

```powershell
git fetch --all --prune
git switch <RELEASE_BRANCH>
git pull --ff-only
git rev-parse HEAD
git status --short
npm ci
npm run test:all
npm run test:coverage
npm audit
```

Required results:

1. `<RELEASE_BRANCH>` is the approved release branch (normally `main` after
   reviewed feature merges), and `git rev-parse HEAD` equals `<FULL_GIT_SHA>`.
2. The working tree contains no unexplained application or configuration
   changes. Review local-only files such as `.claude/settings.local.json`
   explicitly; they are not release inputs.
3. All unit, catalogue/export, build/dry-deploy, Worker API, and Playwright tests
   pass.
4. Coverage is reviewed as **logic-layer coverage only**; it is not route/UI
   line coverage.
5. `npm audit` has no unaccepted production advisory.
6. A fresh peer review confirms the release blockers above are closed.

Stop on any failure.

## 3. Authenticate to the correct Cloudflare account

```powershell
npx wrangler login
npx wrangler whoami
```

Confirm the account owns the active DNS zone for both production hosts. If the
hostnames already have CNAME records, resolve that conflict before using Worker
Custom Domains; Cloudflare cannot attach a Custom Domain to a hostname with an
existing CNAME.

For CI, use a least-privilege `CLOUDFLARE_API_TOKEN` secret instead of an
interactive login. Never commit it.

## 4. Create or identify production storage

First check whether approved production resources already exist:

```powershell
npx wrangler d1 list
npx wrangler kv namespace list
npx wrangler r2 bucket list
```

Create only missing resources. `oc` is the local CLI's Oceania location hint;
confirm residency/compliance requirements before choosing it.

```powershell
npx wrangler d1 create apertly-db --location=oc
npx wrangler kv namespace create apertly-kv
npx wrangler r2 bucket create apertly-files --location=oc
```

Record the D1 `database_id` and KV namespace `id`. R2 is bound by bucket name.
Do not create duplicates merely because a resource is absent from
`wrangler.jsonc`.

## 5. Decide whether Sanity is active for this release

The application can run against its built-in catalogue. Sanity is optional, but
the browser and Worker must use the same source.

### Option A: keep Sanity disabled

Omit all `SANITY_*` Worker variables and do not set `VITE_SANITY_*` while
building. Record that the built-in catalogue is the production source, then
continue to step 6.

### Option B: activate Sanity

The current repository does not yet contain a reproducible Studio package. Add
and review a `sanity/package.json` with local `sanity`, `react`, and `react-dom`
dependencies before treating Studio deployment as release-ready. Commit the
manifest and lockfile; do not rely on an ad-hoc global install.

Also close the Sanity review findings before activation: use generated IDs for
ordinary imported documents, retain `_key` in object-array projections, establish
a typed query/TypeGen boundary, strengthen schema validation, and bound/fail over
the client and Worker catalogue fetches. Until then, choose Option A.

The runtime clients do not carry a Sanity read token. Therefore, the selected
dataset must be public. If the catalogue must be private, stop and implement a
server-only token/proxy design before deployment.

1. Create/select the Sanity project in Sanity Manage and confirm the production
   dataset.
2. In a PowerShell session, configure the existing Studio skeleton:

   ```powershell
   $env:SANITY_STUDIO_PROJECT_ID = "<SANITY_PROJECT_ID>"
   $env:SANITY_STUDIO_DATASET = "production"
   Set-Location sanity
   npx sanity@latest login
   npx sanity@latest datasets list --project-id <SANITY_PROJECT_ID>
   npx sanity@latest datasets visibility get production --project-id <SANITY_PROJECT_ID>
   ```

3. If the dataset does not exist, create it explicitly as public:

   ```powershell
   npx sanity@latest datasets create production --visibility public --project-id <SANITY_PROJECT_ID>
   ```

   If it already exists but is private, do not change visibility without an
   approved data-classification decision.

4. Return to the repository root, generate the reviewed import, and inspect its
   tests before importing:

   ```powershell
   Set-Location ..
   npm run test:catalogue
   npm run sanity:ndjson
   ```

5. For a non-empty dataset, export a backup before any import:

   ```powershell
   Set-Location sanity
   npx sanity@latest datasets export production "sanity-production-before-import.tar.gz" --project-id <SANITY_PROJECT_ID>
   ```

6. Import the initial catalogue. Do not add `--replace` unless replacement of
   matching document IDs is explicitly intended and the backup was verified.

   ```powershell
   npx sanity@latest datasets import catalogue.ndjson --dataset production --project-id <SANITY_PROJECT_ID>
   ```

7. Deploy the Studio and require schema deployment to succeed:

   ```powershell
   npx sanity@latest deploy --schema-required
   npx sanity@latest schemas list
   ```

8. Add exact browser origins in Sanity Manage under **Settings > API settings >
   CORS Origins**, or with `sanity cors add`:

   ```powershell
   npx sanity@latest cors add https://<CUSTOMER_HOST>
   npx sanity@latest cors add https://<OPS_HOST>
   npx sanity@latest cors list
   ```

   Choose **no credentials** for these public read-only origins. Do not use a
   wildcard. Sanity-hosted Studio deployment manages its own Studio origin.

9. Return to the repository root:

   ```powershell
   Set-Location ..
   ```

## 6. Configure and verify Resend

1. Add a sending domain or subdomain in Resend.
2. Publish the exact SPF and DKIM records supplied by Resend in Cloudflare DNS.
3. Wait until Resend reports the domain as `verified`.
4. Create a **Sending access** API key restricted to that domain; do not use a
   full-access key.
5. Choose a From address at the verified domain that can receive replies.

Keep the key available for step 10, but do not paste it into source,
`wrangler.jsonc`, a ticket, or shell history.

## 7. Create Cloudflare Access protection before publishing ops

Cloudflare recommends creating the Access application before exposing the
public hostname.

1. Open **Cloudflare Zero Trust > Access controls > Applications**.
2. Select **Create new application > Self-hosted and private > Add public
   hostname**.
3. Set the public hostname to `https://<OPS_HOST>`.
4. Add a narrow Allow policy for named staff identities or managed IdP groups.
   Do not allow an email-domain suffix alone unless that is an accepted policy.
5. Select the workforce identity provider, enable instant authentication when
   only one IdP is used, and require MFA in the IdP or Access policy.
6. Choose an approved short session duration.
7. Confirm the application is deny-by-default and test a non-staff identity.
8. Copy the application AUD and the Access team subdomain name.

The Worker must also validate the Access assertion to protect against routing
or edge-policy mistakes. Do not pass the release gate until the fail-closed JWT
validation finding has been fixed and tested.

## 8. Make `wrangler.jsonc` production-safe

Treat `wrangler.jsonc` as the source of truth. Before deployment, its effective
configuration must contain the real resource IDs and production values below.
Preserve the existing `main`, compatibility, asset, and migration settings.

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "apertly",
  "workers_dev": false,
  "routes": [
    { "pattern": "<CUSTOMER_HOST>", "custom_domain": true },
    { "pattern": "<OPS_HOST>", "custom_domain": true }
  ],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "apertly-db",
      "database_id": "<REAL_D1_DATABASE_ID>",
      "migrations_dir": "migrations"
    }
  ],
  "kv_namespaces": [
    { "binding": "KV", "id": "<REAL_KV_NAMESPACE_ID>" }
  ],
  "r2_buckets": [
    { "binding": "FILES", "bucket_name": "apertly-files" }
  ],
  "vars": {
    "APP_ENV": "production",
    "STAFF_EMAIL_DOMAINS": "<STAFF_DOMAIN>",
    "EMAIL_FROM": "OpenFrame <quotes@<VERIFIED_SENDING_DOMAIN>>",
    "ACCESS_TEAM_DOMAIN": "<ACCESS_TEAM_NAME>",
    "ACCESS_AUD": "<ACCESS_APPLICATION_AUD>",
    "SANITY_PROJECT_ID": "<SANITY_PROJECT_ID>",
    "SANITY_DATASET": "production"
  },
  "secrets": {
    "required": ["RESEND_API_KEY"]
  }
}
```

If Sanity is disabled, omit its two variables. `ACCESS_TEAM_DOMAIN` must be the
team name consumed by the current code, not the full URL. Do not configure vars
only in the Cloudflare dashboard: the next Wrangler deployment can overwrite
dashboard-managed vars.

Commit and peer-review this production configuration. Confirm that no
`REPLACE_WITH_*`, `APP_ENV: development`, test host, or test resource remains:

```powershell
rg -n "REPLACE_WITH|development|localhost|example\.com" wrangler.jsonc
git diff --check
git diff -- wrangler.jsonc
```

## 9. Apply and verify D1 migrations

Verify the binding points to the intended production database:

```powershell
npx wrangler d1 info apertly-db
npx wrangler d1 migrations list apertly-db --remote
npx wrangler d1 time-travel info apertly-db
```

Record the pre-migration Time Travel bookmark in the release record, then apply
the append-only migrations:

```powershell
npm run db:migrate:remote
npx wrangler d1 migrations list apertly-db --remote
```

The final list must show no unapplied migrations. **Do not run
`scripts/db/seed.sql` in production**; it contains demo identities and data.

For later releases, remember that a Worker rollback does not undo D1 schema or
data changes. Migrations must be backward-compatible with the version retained
for rollback.

## 10. Build and perform the first production deployment

Do not use `npm run cf:deploy` for the first production release. That convenience
script cannot supply the first secret atomically and does not itself establish
the required Vite build-time values.

If Sanity is active, its public Vite values must be present **at build time**:

```powershell
$env:VITE_SANITY_PROJECT_ID = "<SANITY_PROJECT_ID>"
$env:VITE_SANITY_DATASET = "production"
```

If Sanity is disabled, make sure those variables are absent:

```powershell
Remove-Item Env:VITE_SANITY_PROJECT_ID -ErrorAction SilentlyContinue
Remove-Item Env:VITE_SANITY_DATASET -ErrorAction SilentlyContinue
```

Create an ignored, short-lived secrets file without echoing or placing the key
in shell history. `.env.*` is already ignored by the repository, but verify it
is not tracked before continuing:

```powershell
$secureResendKey = Read-Host "Resend sending key" -AsSecureString
$plainResendKey = [System.Net.NetworkCredential]::new("", $secureResendKey).Password
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) ".env.production.deploy"),
  "RESEND_API_KEY=$plainResendKey",
  [System.Text.UTF8Encoding]::new($false)
)
$plainResendKey = $null
$secureResendKey = $null
git check-ignore .env.production.deploy
```

Build and dry-run the exact deployment configuration:

```powershell
npm run build
npx wrangler deploy --dry-run --secrets-file .env.production.deploy
```

Inspect the dry-run output. Confirm the Worker name, production bindings,
Custom Domains, `APP_ENV`, static assets, and required secret name. A dry run
must not show placeholder IDs or a `workers.dev` production target.

Deploy once, uploading the Resend secret in the same version. This avoids
`wrangler secret put` before the first deployment; that command itself creates
and immediately deploys a Worker version.

```powershell
$releaseSha = git rev-parse --short=12 HEAD
npx wrangler deploy --secrets-file .env.production.deploy --message "production $releaseSha"
```

After a successful deployment, securely delete the temporary secrets file and
clear the Vite variables from the shell when no longer needed:

```powershell
Remove-Item -LiteralPath ".env.production.deploy" -Force
Remove-Item Env:VITE_SANITY_PROJECT_ID -ErrorAction SilentlyContinue
Remove-Item Env:VITE_SANITY_DATASET -ErrorAction SilentlyContinue
```

For subsequent deployments, existing Worker secrets are preserved when they
are omitted. Rotate a secret deliberately through an approved secret-management
procedure; note that `wrangler secret put` immediately creates a deployment.

## 11. Verify domains, Access, and the application

Custom Domains create the required DNS records and certificates. Wait for both
hosts to become active, then run these checks.

### Public health and routing

```powershell
curl.exe --fail-with-body "https://<CUSTOMER_HOST>/api/health"
curl.exe --fail-with-body "https://<CUSTOMER_HOST>/products"
```

The health JSON must contain:

- `ok: true`;
- `env: "production"`; and
- `bindings.db`, `bindings.files`, and `bindings.kv` all `true`.

The `/products` request must return the customer SPA, not a 404 or ops shell.

### OTP and email

Using a controlled production mailbox:

1. Request a customer OTP through the browser.
2. Confirm the JSON response does **not** contain `devCode`.
3. Confirm the email arrives from the verified From domain.
4. Verify the OTP once and confirm the session cookie is `HttpOnly`, `Secure`,
   and `SameSite=Lax`.
5. Confirm a wrong code and an expired code are rejected.
6. Review Resend delivery logs for the test message.

### Ops isolation

1. In a signed-out/private browser, open `https://<OPS_HOST>` and confirm
   Cloudflare Access intercepts the request before the app loads.
2. Confirm a non-staff identity is denied.
3. Authenticate with the designated bootstrap administrator and confirm the ops
   shell loads only after Access.
4. Confirm the customer host does not expose the ops shell.

### Sanity, if active

1. Open customer catalogue and product detail pages.
2. Confirm content matches the published production dataset.
3. Check the browser console for CORS or Sanity fetch failures.
4. Confirm Worker-side pricing and displayed catalogue agree for a controlled
   configured item.
5. Publish a harmless test edit, wait for the configured cache window, verify it,
   then restore the approved content.

### Storage and workflow

1. Submit a controlled quote with contact data and a valid line.
2. Confirm D1 contains the expected owner/contact/project/line state.
3. Upload a harmless test file and confirm the approved quarantine/scanning
   policy works before staff download.
4. Complete only the minimum approved workflow needed to validate role gates.
5. Remove or clearly label the controlled test records according to the data
   retention policy.

## 12. Bootstrap the first administrator safely

The production database is intentionally not demo-seeded. The first Access
login creates an internal user with no role, while role assignment requires an
existing admin. Use this one-time, named-email bootstrap after Access succeeds:

```powershell
npx wrangler d1 execute apertly-db --remote --command "SELECT id,email,type,role FROM user WHERE lower(email)=lower('<NAMED_ADMIN_EMAIL>');"
npx wrangler d1 execute apertly-db --remote --command "UPDATE user SET role='admin' WHERE lower(email)=lower('<NAMED_ADMIN_EMAIL>') AND type='internal' AND role IS NULL;"
npx wrangler d1 execute apertly-db --remote --command "SELECT id,email,type,role FROM user WHERE lower(email)=lower('<NAMED_ADMIN_EMAIL>');"
```

Require exactly one intended row before and after the update. Record the actor,
timestamp, email, and D1 bookmark in the release record. Then use the admin UI
to assign least-privilege roles to other staff. Do not bootstrap an entire
domain or use an unnamed/shared account.

## 13. Observe and close the release

During smoke testing, tail production errors in a separate terminal:

```powershell
npx wrangler tail apertly --format pretty --status error
```

Also review:

- Cloudflare Worker errors, request volume, and latency;
- D1 errors and migration state;
- KV/R2 operation errors and unexpected storage growth;
- Resend delivery/bounce/complaint logs;
- Cloudflare Access authentication events; and
- Sanity API/CDN errors if enabled.

Record the deployed version and release commit:

```powershell
npx wrangler deployments list
git rev-parse HEAD
git status --short
```

Close the release only when smoke tests pass and monitoring is clean.

## 14. Rollback and recovery

### Worker code/config rollback

```powershell
npx wrangler deployments list
npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --message "rollback: <REASON>"
```

Rollback immediately creates a new deployment of the selected Worker version.
It does **not** roll back D1, KV, R2, or Sanity content.

### D1 recovery

Use D1 Time Travel only when data/schema recovery is necessary. It overwrites
the database in place and cancels in-flight queries, so obtain incident approval
and use the recorded bookmark or an approved RFC3339 timestamp:

```powershell
npx wrangler d1 time-travel info apertly-db --timestamp "<RFC3339_TIMESTAMP>"
npx wrangler d1 time-travel restore apertly-db --bookmark "<BOOKMARK>"
```

Record the undo bookmark returned by the restore. Cloudflare states that Time
Travel is automatic; retention depends on the Workers plan.

### Sanity recovery

Restore only from a verified export and only after confirming whether matching
documents should be replaced. Sanity content recovery is independent of Worker
rollback.

### R2 and KV

Worker versions do not contain R2 objects or KV values. Define separate
retention/recovery procedures before go-live; do not assume a code rollback will
restore uploaded files, OTP/session state, or deleted objects.

## Validated primary references

- [Cloudflare Wrangler configuration and required secrets](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare Worker environments](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Cloudflare Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Worker versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Cloudflare Access self-hosted applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Sanity datasets CLI](https://www.sanity.io/docs/cli-reference/cli-datasets)
- [Sanity Studio deployment](https://www.sanity.io/docs/studio/deployment)
- [Sanity schema deployment](https://www.sanity.io/docs/apis-and-sdks/schema-deployment)
- [Sanity CORS configuration](https://www.sanity.io/docs/content-lake/cors)
- [Resend domain configuration](https://resend.com/docs/dashboard/domains/introduction)
- [Resend API-key permissions](https://resend.com/docs/dashboard/api-keys/introduction)
