# Operations guide — OpenFrame

Day-to-day playbook: **load test data**, **reach the customer + admin areas**, and
**get the latest code onto Cloudflare**. For first-time cloud provisioning
(D1/KV/R2, domains, Cloudflare Access) see [`DEPLOY.md`](DEPLOY.md).

- **Public brand:** OpenFrame (`openframe.com.au`).
- **Internal infra codename:** `apertly` (Worker name, `apertly-db` / `apertly-kv`
  / `apertly-files`). Kept deliberately — it is not customer-facing.
- **Two front-ends, one Worker:** the customer SPA is served on the root host; the
  ops console is served on `ops.*` (the Worker routes by `Host`). Product catalogue
  data is served from Sanity when configured, otherwise from the built-in
  `src/data/catalogue.ts` fallback.

---

## 1. Load test data

The seed gives you a customer, a staff user, and one in-flight order to click through.

```bash
npm install                 # first time only
npm run db:reset            # local: (re)create schema, clear rows, load fixtures
```

Flags:

| Command | Effect |
|---|---|
| `npm run db:reset` | Local, lock-safe — safe to run while `npm run dev:api` is up. |
| `npm run db:reset -- --hard` | Local, also wipes KV sessions/OTP + R2 (needs the dev API stopped). |
| `npm run db:reset -- --remote` | **Empties the DEPLOYED database** and reloads demo fixtures. Asks for a typed confirmation; refuses without a terminal. There is no undo short of a D1 Time Travel restore (DEPLOY.md §9). |

### Seeded accounts (passwordless email OTP)

| Role | Email | Notes |
|---|---|---|
| Customer | `gediminas.bereznevicius@gmail.com` | Has a draft project + order **OF-58001** mid-journey. |
| Customer | `doni@siaribuild.com.au` | Second customer. |
| Customer | `sarah@northsidebuild.com.au` | Third customer, for multi-user views. |
| Staff (admin) | `ged@openframe.com.au` | Internal user — signs into the ops console. |
| Staff (admin) | `doni@openframe.com.au` | Second admin. |

These come from `scripts/db/seed.sql` and a test asserts this table matches it —
the guide previously named two accounts the seed had never created, so following
it produced a rejected sign-in and no explanation.

Staff sign-in is gated by `STAFF_EMAIL_DOMAINS` (default `openframe.com.au`); only
`@openframe.com.au` addresses can reach the console via OTP — and only where
Cloudflare Access is not configured. In production the OTP routes return 404.

### Getting the OTP code in dev

There are no real emails locally. When `APP_ENV` is exactly `development`, requesting a
code returns it in the API response as `devCode` **and** logs it to the `dev:api`
console. Use that value on the verify step. In production this is disabled and codes
go out via Resend.

---

## 2. Access the customer & admin areas

Start both processes (two terminals):

```bash
npm run dev:api             # Worker + D1/KV/R2 on http://localhost:8787
npm run dev                 # Vite front-end (proxies /api to the Worker)
```

### Customer area

- Open the Vite URL (root host).
- Get a quote / build a project, or **sign in** with `demo@openframe.com.au`
  (request OTP → paste the `devCode`) to see the dashboard, the draft project, and
  order **OF-58001**.
- Guest order tracking works without login: order ref `OF-58001` +
  `demo@openframe.com.au`.

### Admin area (ops console)

The console is served on the `ops.*` host, so you must hit an `ops.` hostname — the
Worker routes by `Host`:

- Against the Worker directly: **`http://ops.localhost:8787`**
  (`*.localhost` resolves to 127.0.0.1 in modern browsers).
- Sign in with `ged@openframe.com.au` (OTP → `devCode`). Non-allowlisted emails
  are rejected.

Locally this works because `npm run dev:api` runs with Cloudflare Access **off**
(and `APP_ENV=development`), so the staff email-OTP session fallback is active. In
production the ops subdomain sits behind **Cloudflare Access** (staff IdP + MFA) and
that fallback is disabled by design. The production `ACCESS_*` / `APP_ENV` values
live in `wrangler.jsonc` and are used by `npm run cf:deploy`; see `DEPLOY.md` §6.
In production the OTP routes do not merely go unused — they return 404, so there is
no emailed-code path into the staff table on any hostname.

---

## 3. Push the latest code → Cloudflare rebuild

Cloudflare builds from the **`apertly`** GitHub remote's `main` branch. If the
deployed site is missing recent work (e.g. the contact form or the How-It-Works
page), it's because those commits haven't reached `apertly/main` yet.

### Remotes in this repo

| Remote | URL | Role |
|---|---|---|
| `apertly` | `github.com/siaribuild/apertly.git` | **CF builds from here** (`main`). |
| `origin` | `github.com/siaribuild/amj-design.git` | Legacy mirror. |

The local working branch is **`main`**, which tracks `apertly/main`. (`apertly-main` is an older local branch, long behind.)

### Ship it

```bash
# 1. Sanity-check before shipping
npm run build               # customer + ops bundles compile
npm test                    # backend + unit + api suites
# (optional, needs a local Chrome) npm run test:web

# 2. Commit
git add -A
git commit -m "your message"

# 3. Push the branch CF builds
git push apertly main
```

That push triggers Cloudflare's build. Watch it in the Cloudflare dashboard
(Workers & Pages → the project → **Deployments**). When it goes green, hard-refresh
the site.

### Verify the deploy is current

```bash
curl https://openframe.com.au/api/health
```

If a change still isn't visible after a green build, it's a browser/edge cache —
hard-refresh, or confirm the commit is actually on `apertly/main`:

```bash
git log --oneline -5 apertly/main
```

> **Note:** this is the **git-push → auto-build** path. `DEPLOY.md` §8 documents the
> alternative manual `npm run cf:deploy` (local `wrangler deploy`) for when you need
> to push a build without going through GitHub.
