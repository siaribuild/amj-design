# ai-parse-monitoring — the ask (stage 0, grill conclusions)

Grilled 2026-09-03 in the main session; the owner answered three rounds. These
conclusions are binding on every later stage.

## The ask, as originally put

> With AI parsing in place, it becomes important to have visibility on parsing
> jobs getting through — success, errors, outstanding AI balance and other I
> might have not thought of. Ideally, visibility on such in the ops and/or
> Cloudflare dashboard, or both or different granularity.

## Actors and needs

**Staff** (CONTEXT.md canonical actor — an ops-console operator, two owners
today) is the only actor this feature serves. The need: a glance at the ops
console answers "is AI parsing healthy, and is the AI budget about to run out"
— *before* clients feel it. Nobody watches live; clients trigger parses by
uploading, so the console must surface what already went wrong and what is
about to (budget exhaustion), not stream what is happening.

Customers, Visitors and Manufacturer partners are untouched. No customer
surface changes.

## Decisions (owner-ruled)

1. **Surface: ops2 Attention page, cards.** The Attention page (today a
   placeholder route) becomes a card container. No new page. No custom
   Cloudflare dashboard — the CF dashboard (Workers Observability, AI Gateway
   logs) stays as-is as the deep-debug layer; nothing is built there and
   nothing from it is reused for the cards (sampled logs are not a source of
   truth; D1 and the billing APIs are).
2. **Five separate cards**: credit balance · cap outstanding · total success
   (7d) · total errors (7d) · 7-day success-vs-error chart. The destination
   blurb's "Not a metrics page" ruling is amended to allow cards; what needs
   a person still leads.
3. **No drill-down in v1.** Numbers and a chart only. Error rows / per-quote
   drill is a later feature.
4. **One document == one parse.** The chart and the 7d totals count per
   uploaded document, not per job-claim generation or model request.
   Ops-triggered building-model runs are not in the chart; money numbers
   cover everything regardless because Cloudflare is their source.
5. **Cloudflare is the source of truth for money.**
   - Credit balance: `GET /accounts/{account_id}/ai-gateway/billing/credit-balance`
   - Billed spend: `GET /accounts/{account_id}/ai-gateway/billing/usage-history`
   - Cap: per-gateway `spend_limits.rules` from
     `GET /accounts/{account_id}/ai-gateway/gateways/openframe-estimator`;
     fall back to the (write-deprecated, still readable)
     `/ai-gateway/billing/spending-limit` account endpoint.
   - Job counts come from D1 (existing tables), never from Cloudflare.
6. **Freshness: piggyback the existing `*/10` cron.** Each run fetches the CF
   numbers and snapshots them to KV; the header bubble and the cards read the
   snapshot. No CF call on page load. CF API unavailable / token missing ⇒
   cards show "unavailable", never a false red and never a blocked page.
7. **Cloudflare setup (the whole of it):** one API token with **AI Gateway:
   Read + Account Analytics: Read**, stored as a Worker secret. Nothing else.
8. **Notifications: red only, seeded as a subsystem.** Header bubble shows
   the count of active notifications; tap navigates to Attention. v1 has
   exactly one source: AI budget red (credit balance below a floor OR cap %
   used above a ceiling — both values in wrangler `vars`). No amber tier, no
   persistence, no dismiss/read state. The aggregation is a multi-source
   seed: parallel work adds an "orders need attention" source (clears on
   order submit), then customer messages (clears on read/respond). Design
   the source interface so those append without rework.
9. **Error definition includes the silent death.** A parse counts as errored
   when its claim is terminally `failed` OR stuck `processing` older than 30
   minutes (the lease-expired-with-attempts-exhausted gap found in
   `worker/lib/ai/jobs.ts` — such a row is never retried and never marked
   failed). One SQL predicate; no stuck-job subsystem, no live monitoring.
10. **Branch/base:** `feat/ai-parse-monitoring` off `apertly/main` (284f89ff).
    The unmerged `feat/ops2-parse-metadata` branch is being merged to main by
    other agents; this feature does not depend on it and touches disjoint
    files.

## Explicitly out of scope (v1)

- Email/push alerts; amber warning tier
- Error drill-down rows and per-quote error lists
- Live queue-depth / DLQ introspection (GraphQL datasets exist —
  `queueBacklogAdaptiveGroups` — noted for later, not built)
- AI Gateway GraphQL analytics (`aiGatewayRequestsAdaptiveGroups`) — only if
  billed usage-history proves insufficient
- Notification persistence, dismissal, read-state
- Any change to the parse pipeline itself

## Facts established during the grill

- All model calls route through AI Gateway `openframe-estimator` (unified
  billing, $20/mo cap today — but the cap is READ from the API, never
  hardcoded).
- D1 already records job state: `ai_job_claim` (status/attempts/error),
  `ai_runs` (+ token_usage_json/cost_json), `schedule_parse_job`
  (+ tokens, estimated_cost_microusd). Failures are written terminally
  except the stuck-`processing` gap in decision 9.
- Ops2 nav: Attention is first in the workspace section; only Projects has a
  real page today; `/attention` renders the DestinationRoot placeholder.
- The attention-pill work (PR #35) is the project-record pill, unrelated to
  the Attention page container.
