# Design — Worker `/health` endpoint

Spec: `docs/runs/smoke-test/01-spec.md`. No UI, no migrations, no schema. No new domain terms — `CONTEXT.md` unchanged (a health probe is infrastructure vocabulary, not CPQ language).

## 1. Shape of the change

Two health facts already exist in the worker and they stay separate on purpose:

- **`/api/health`** (existing, `worker/index.ts:39-47`) — the *liveness* probe: process up, bindings present. The test harness (`waitForUrl`, `scripts/tests/api.test.mjs:56`, `api-edge.test.mjs:31`), `playwright.config.ts:33`, and docs all point at it. **Untouched** (spec criterion 12).
- **`/health`** (new, root path) — the *deploy-verification* probe: which build, and does D1 actually answer. Exact body `{ status: "ok"|"degraded", sha: string, db: "ok"|"error" }`, 200 or 503.

They answer different questions ("is a worker running" vs "is *this commit* running and wired to the database"), so this is not a one-fact-two-homes violation — but the D1-verdict logic lives in one place (`worker/lib/health.ts`) should `/api/health` ever want it.

## 2. Affected files (hand-off index)

| File | Where | Change |
|---|---|---|
| `worker/lib/health.ts` | **new** | `checkHealth(env)` — the whole health verdict lives here |
| `worker/types.ts` | `Env` interface, insert after `APP_ENV` (line 12) | add `BUILD_SHA?: string` with a doc comment: set by `scripts/cf-deploy.mjs` at deploy; absent locally ⇒ sha "unknown" |
| `worker/index.ts` | inside `route()`, immediately after the `/api/health` cheap-probe line (line 274); also the exit-count comment at lines 162–167 | add the `/health` exit; bump "nine exits" → "ten" and name it |
| `scripts/cf-deploy.mjs` | **new** | node deploy wrapper: build, resolve `git rev-parse HEAD`, `wrangler deploy --var APP_ENV:production --var BUILD_SHA:<sha>` |
| `package.json` | `cf:deploy` (line 13); `test:pure` (line 17); scripts block | point `cf:deploy` at the wrapper; add `scripts/tests/health.test.mjs` to `test:pure`; add `"test:health": "node --test scripts/tests/health.test.mjs"` |
| `scripts/tests/health.test.mjs` | **new** | pure unit suite (esbuild-bundle pattern, no worker boot) |
| `scripts/tests/api.test.mjs` | wrangler `start` args (lines 48–55); "health, routing, and unauthenticated access boundaries" subtest (line 65) | pass `--var BUILD_SHA:<fixture sha>`; add `/health` integration assertions |
| `docs/DEPLOY.md` | verification section (near line 183) | one line: `curl https://openframe.com.au/health` — sha must equal the deployed commit |

## 3. Interfaces

### `worker/lib/health.ts` (new — single source of the health verdict)

```ts
import type { Env } from "../types";

export interface HealthBody {
  status: "ok" | "degraded";
  sha: string;               // full commit sha, or "unknown"
  db: "ok" | "error";        // fixed tokens only — never an error message (criterion 7)
}

/** One trivial read against D1; writes nothing (criterion 5). An absent
 *  binding and a throwing query are the same fact: db unreachable. */
export async function checkHealth(env: Env): Promise<{ body: HealthBody; httpStatus: 200 | 503 }>
```

Implementation notes for the developer:
- `const sha = env.BUILD_SHA || "unknown"` — empty string counts as unknown (criterion 4).
- `try { await env.DB.prepare("SELECT 1").first(); db = "ok" } catch { db = "error" }` — an absent `DB` binding throws on `.prepare` and lands in the same catch. The caught error is **discarded**: not logged, not returned (criterion 7).
- `status` is `"ok"` iff `db === "ok"`; `httpStatus` 200/503 maps 1:1 from `status` (ASSUMED-4). The mapping lives here, not in the route.
- The function never touches the request — criteria 10/11 fall out structurally.

### `worker/index.ts` route exit (thin — no logic)

Placed directly under the existing `/api/health` bypass at line 274, i.e. before `ensureCatalogue` (never waits on Sanity) and before shell selection (works on both hosts and on preview URLs):

```ts
// Deploy verification: which build is serving, and does D1 answer. Public by
// design (spec ASSUMED-1) — body is fenced to { status, sha, db }.
if (url.pathname === "/health") {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", "Allow": "GET, HEAD" } });
  }
  const { body, httpStatus } = await checkHealth(env);
  return new Response(JSON.stringify(body),
    { status: httpStatus, headers: { "Content-Type": "application/json" } });
}
```

- Matching on `url.pathname` alone means query strings are inert (criterion 10) and the body is never read (criterion 11).
- HEAD is allowed alongside GET (dumb uptime checkers use it); POST/PUT/PATCH/DELETE get 405 (criterion 8).
- Security headers arrive from `applySecurity` in the fetch wrapper — this is a new exit from `route()`, so the **exit-count comment at lines 162–167 must be updated (nine → ten)**; that comment exists precisely to catch uncounted exits.
- The trailing-slash 301 at lines 207–213 fires for `GET /health/` before this exit; that is existing, correct behaviour — no special-casing.

### `scripts/cf-deploy.mjs` (new — how the sha gets in)

ASSUMED-5: build-time injection via a deploy-time var (a Worker has no git). A node wrapper rather than shell substitution in the npm script because `$(git rev-parse HEAD)` does not expand under cmd.exe on this Windows dev machine.

```
1. spawn: vite build && vite build -c vite.ops2.config.ts   (same as today's cf:deploy)
2. sha = execFileSync("git", ["rev-parse", "HEAD"]).trim()  — on any git failure: omit the var
3. spawn: wrangler deploy --var APP_ENV:production --var BUILD_SHA:<sha>
```

Export `resolveBuildSha(): string | null` and guard the main flow with `import.meta.url === pathToFileURL(process.argv[1]).href` so the unit suite can test sha resolution without deploying. Reuse `run`/`wranglerCli`-style spawning from `scripts/tests/helpers.mjs`? No — helpers.mjs is test-scoped and parses seed.sql at import; keep the wrapper self-contained (~25 lines, `node:child_process` only).

Known, accepted gap: a raw `wrangler deploy` or `wrangler versions upload` (the preview path in the deploy protocol) ships without `BUILD_SHA` → sha reads `"unknown"`. Criterion 4 makes that safe and visible rather than wrong. A `cf:preview` wrapper is YAGNI until the preview flow hurts.

## 4. Data model / migrations

None. This feature adds no schema and must not (spec §3). `d1-migration-safety` not engaged — no file under `migrations/` is touched, no cascade surface exists.

## 5. Sequencing

1. **t1 — lib + unit tests (red first).** `worker/lib/health.ts`, `Env.BUILD_SHA`, `scripts/tests/health.test.mjs`, package.json test wiring. Pure; Probity sees the failing test before the lib exists.
2. **t2 — route exit + integration assertions** (after t1). `worker/index.ts` exit + exit-count comment; `api.test.mjs` gets `--var BUILD_SHA:<fixture>` and the `/health` assertions in the existing boot — no new worker boot, no new heavy suite.
3. **t3 — deploy wrapper** (after t1, because both edit package.json and the unit suite covers `resolveBuildSha`). `scripts/cf-deploy.mjs`, `cf:deploy` script line, DEPLOY.md line.

## 6. Test plan

**`scripts/tests/health.test.mjs`** (new, pure — esbuild stdin-bundle pattern copied from `scripts/tests/ai-pipeline.test.mjs:24-47`; wired into `test:pure` and `test:health`):
- healthy env stub (`DB.prepare("SELECT 1").first()` resolves, `BUILD_SHA` set) → `{ body: {status:"ok", sha, db:"ok"}, httpStatus: 200 }`, and the body has **exactly** the keys `status, sha, db` (criterion 9).
- `first()` rejects → `status:"degraded"`, `db:"error"`, `httpStatus: 503`, sha still present, and no fragment of the thrown message appears anywhere in the serialized body (criteria 6–7).
- `DB` binding absent (`env.DB = undefined`) → same degraded shape, no throw (criterion 6).
- `BUILD_SHA` unset and empty-string → `sha: "unknown"`, verdict unaffected (criterion 4).
- stub `prepare` records calls → exactly one statement, `SELECT 1`, no `.run()` (criterion 5).
- `resolveBuildSha()` from `scripts/cf-deploy.mjs` returns a 40-char hex sha in this repo (t3; plain import, no bundling needed).

**`scripts/tests/api.test.mjs`** (existing boot, extended in the line-65 subtest):
- `GET /health` → 200, `Content-Type: application/json`, body deep-equals `{ status:"ok", sha:"<fixture sha>", db:"ok" }` — proving the `--var` plumbing end to end (criteria 1–3).
- `POST /health` → 405 (criterion 8; the suite's later D1 row-count assertions already prove no write occurred).
- `GET /health?sql=DROP%20TABLE%20user&db=other` → body identical to the bare call (criterion 10).
- Criterion 12 (nothing shadowed, `/api/health` unchanged) = the rest of `api.test.mjs` + `api-edge.test.mjs` staying green, including the existing `/api/health` shape assertions at lines 66–68.

Playwright: none — no UI change (spec §3 exempts this explicitly).

## 7. Security

- **Data classification.** Response exposes two values: the deployed commit sha (commercial, low — repo is private, sha alone is not actionable; ASSUMED-2, owner-vetoable) and a binary D1 verdict (public). No PII, no pricing, no config values, no error text. The body is a closed set of three keys, asserted exactly in both suites.
- **Trust boundaries.** One crossing: anonymous internet → Worker. Nothing from the request crosses inward — path match only; query, headers and body are never read, so nothing caller-supplied can reach D1 (criterion 10 is structural, not filtered).
- **Authorization per endpoint.** `GET|HEAD /health`: **anyone, by design** (ASSUMED-1 — its value is being checkable on a preview URL with no session). The single query is the constant `SELECT 1` — no rows, no parameters, hence no account-scoping WHERE clause exists or is needed. All other methods: 405. No other endpoint changes; `/health` bypasses no middleware for any other path (it is a self-contained exit in `route()`).
- **Abuse cases.**
  - Parameter/SQL tampering → constant statement, inputs unread (criteria 10–11, tested).
  - Error-detail leakage → caught error discarded; fixed tokens only (criteria 6–7, tested including message-fragment scan).
  - Write via health → GET/HEAD only + read-only statement (criterion 8, tested).
  - Enumeration/replay → response is identical for every caller; nothing to enumerate, replay is idempotent by criterion 5.
  - **Residual risk 1:** each request costs one D1 read — a free, unauthenticated amplification of load onto D1. Accepted: one trivial statement, and rate limiting is explicitly out of scope (spec §3); Cloudflare rate-limiting rules are the upgrade path if it is ever abused.
  - **Residual risk 2:** sha reveals deploy cadence to an observer (ASSUMED-2's veto path — opaque build id — remains open).

## 8. Rejected alternatives

- **Extend `/api/health` instead of adding `/health`.** Breaks its existing contract (`api.test.mjs:66-68`, playwright readiness probe, DEPLOY/OPERATIONS docs) and criterion 9's exactly-three-keys shape can't coexist with `ok/bindings/env/time`. Criterion 12 forbids it.
- **Register on the Hono `api` app.** `/health` is not under `/api/*`; forcing it there means either a second dispatch special-case (which is what the direct exit already is, minus the Hono hop) or renaming the spec'd path. Direct exit is smaller and keeps the catalogue bypass obvious.
- **`wrangler define` / build-time constant for the sha.** wrangler `define` values are static config — they'd need editing per deploy. A deploy-time `--var` through a node wrapper is the same guarantee with zero config churn and works on Windows.
- **Shell substitution in the npm script (`--var BUILD_SHA:$(git rev-parse HEAD)`).** Does not expand under cmd.exe; silently ships the literal string. The node wrapper is deterministic on every platform.
- **New heavy suite booting its own worker.** A worker boot costs minutes; `api.test.mjs` already boots one and owns the "unauthenticated access boundaries" subtest this belongs in.

## Decisions needed

None. The five user-owned points are already carried as vetoable `ASSUMED` tags in the spec (public endpoint, sha exposure, 503 semantics, response shape, build-time injection); this design changes none of them.
