# Spec — Worker `/health` endpoint

**Ask:** `docs/runs/smoke-test/00-ask.md` — "Add a /health endpoint to the worker that returns build sha and D1 connectivity."

**Grill status:** No grill was run. The ask's "Actors and needs" and "Grill conclusions" sections were empty placeholders. The actor below is inferred from the ask and `CONTEXT.md`, not from the owner — see ASSUMED tags.

---

## 1. Problem and actor

**Actor: Staff** (`CONTEXT.md` → Staff — an ops-console operator working for OpenFrame; two owners today). They are also the person who deploys.

**In their terms:** "I just deployed. I need to know, in one request, that the version now serving traffic is the commit I pushed, and that it can actually reach the database — without signing in, opening the console, or clicking through a quote to find out the hard way."

The deploy protocol (`CLAUDE.md`) requires verifying a preview version before promoting it to production. Today there is nothing to hit that answers "which build is this, and is D1 wired up?" — verification means exercising a real business surface, which is slower and confounds a build problem with a data problem.

**Problem statement:** A deployed Worker gives no cheap, unambiguous signal of *which build* is live and *whether its D1 binding works*. Staff cannot confirm a deploy landed, and cannot distinguish "wrong version deployed" from "database unreachable" without guessing.

---

## 2. Acceptance criteria

Sensitive-surface note: `/health` is unauthenticated (ASSUMED-1) and therefore reachable by a Visitor or any third party. It must leak nothing beyond a build identifier and a binary database verdict — hence criteria 6–10.

### Happy path

1. **Given** the Worker is deployed and its D1 binding is healthy, **When** any client sends `GET /health`, **Then** the response is HTTP 200 with `Content-Type: application/json` and a JSON body containing `status`, `sha`, and `db`.

2. **Given** a healthy deploy, **When** `GET /health` returns 200, **Then** `status` is `"ok"` and `db` is `"ok"`.

3. **Given** the Worker was built from commit `<SHA>`, **When** `GET /health` returns, **Then** `sha` equals the first 7+ characters of `<SHA>` and matches the commit actually deployed (verifiable by comparing against `git rev-parse HEAD` of the deployed ref).

4. **Given** the build was produced without commit information available, **When** `GET /health` returns, **Then** `sha` is the string `"unknown"` and the response is still HTTP 200 with `status` reflecting only the D1 verdict — a missing sha never fails the health check and never omits the field.

### D1 connectivity

5. **Given** the D1 binding is present, **When** `GET /health` is handled, **Then** the handler executes exactly one trivial read against D1 (e.g. `SELECT 1`) and writes nothing — verifiable by the endpoint being safe to call repeatedly against production.

6. **Given** the D1 query throws or the binding is absent, **When** `GET /health` is called, **Then** the response is HTTP 503 with `status: "degraded"` and `db: "error"`, and `sha` is still present.

7. **Given** a D1 failure, **When** the 503 body is returned, **Then** the body contains no exception message, stack trace, SQL text, binding name, or database id — the `db` field is one of the fixed tokens `"ok"` / `"error"` and nothing else describes the failure.

### Abuse cases (negative — tester executes these for real)

8. **Given** an unauthenticated caller, **When** they send `POST`, `PUT`, `PATCH` or `DELETE` to `/health`, **Then** the request is rejected (405) and no database write occurs.

9. **Given** an unauthenticated caller, **When** they call `GET /health`, **Then** the response body contains no account, customer, quote, project, pricing, payout, ABN, or environment/secret value — asserted by the response having exactly the keys `status`, `sha`, `db` and no others.

10. **Given** a caller supplies query parameters or headers (e.g. `GET /health?sql=...`, `GET /health?db=other`), **When** the request is handled, **Then** they are ignored entirely: the response is byte-identical (modulo `sha`) to a bare `GET /health`, and no supplied value reaches D1.

11. **Given** a caller sends a large or hostile body on `GET /health`, **When** the request is handled, **Then** the body is never parsed or echoed back in the response.

### Routing

12. **Given** the Worker's existing routes, **When** `/health` is added, **Then** every pre-existing route continues to respond as before (no route shadowed, no auth middleware bypassed for anything other than `/health` itself) — verifiable by the existing worker test suites staying green.

---

## 3. Out of scope

- Any dependency check beyond D1 — Sanity, R2, email, ABR lookups.
- Latency/timing numbers, uptime history, request counters, or any metrics payload.
- A UI for health anywhere in the ops console or customer site (no Playwright coverage is required, because no UI changes).
- Authentication, rate limiting, or IP allow-listing on `/health`.
- Wiring an external uptime monitor or alerting to the endpoint.
- Migrations — this feature adds no schema and must not.
- A `/ready` vs `/live` split, or per-environment variants.

---

## 4. Assumptions (vetoable)

- **ASSUMED-1:** `/health` is **public and unauthenticated**. Rationale: its whole value is being checkable on a preview URL before promotion, and from anything that can't hold a session. Exposure is limited to a commit sha and a binary db verdict, which criteria 7–11 fence in. *Veto path: if the owner wants it staff-only, criteria 8–11 change to a 401/403 shape and the deploy-time smoke check needs a token.*
- **ASSUMED-2:** Exposing the **build sha publicly** is acceptable. It reveals which commit of a private repo is live; the repo is not public, so the sha alone discloses nothing actionable. *Veto path: return a build timestamp or an opaque build id instead.*
- **ASSUMED-3:** The response shape is exactly `{ "status": "ok" | "degraded", "sha": string, "db": "ok" | "error" }`. No caller exists yet, so this is a free choice; it is specified so the tester has something exact to assert.
- **ASSUMED-4:** HTTP **503** (not 200-with-degraded-body) is the correct signal for a D1 failure, so a dumb uptime checker sees it without parsing JSON.
- **ASSUMED-5:** The sha is injected at **build time** (Vite/Wrangler define or an env var set by the deploy), not read at runtime — a Worker has no git.

---

## 5. Sizing

Single endpoint, no schema change, no UI. Comfortably one pipeline run; no wayfinder needed.

## 6. Open questions

None outstanding — the five points above are recorded as assumptions rather than blocking questions, per the pipeline's "proceed on a tagged assumption" rule. Any of them can be vetoed at review without re-speccing the feature.
