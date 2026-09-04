# ai-parse-monitoring — spec

Stage 1. Source: `docs/runs/ai-parse-monitoring/00-ask.md` (stage-0 grill run 2026-09-03;
its ten decisions are binding and are not re-opened here).

Branch: `feat/ai-parse-monitoring` off `apertly/main` (284f89ff).

---

## 1. Problem and the actor it serves

AI parsing is live. Clients trigger parses by uploading; nobody watches them happen.
When a parse dies — or when the AI Gateway credit runs out and *every* parse starts
dying — the first signal today is a client complaining, or an owner opening the
Cloudflare dashboard on a hunch. There is no place in the product that answers "is
parsing healthy, and is the AI budget about to run out".

**Actor: Staff** (CONTEXT.md canonical actor — an ops-console operator, two owners
today) is the only actor this feature serves. The need, in the grill's words:

> a glance at the ops console answers "is AI parsing healthy, and is the AI budget
> about to run out" — *before* clients feel it. Nobody watches live; clients trigger
> parses by uploading, so the console must surface what already went wrong and what
> is about to (budget exhaustion), not stream what is happening.

Customers, Visitors and Manufacturer partners are untouched. No customer surface
changes.

**Done looks like:** the ops2 Attention page shows five cards — credit balance, cap
outstanding, 7-day parse successes, 7-day parse errors, and a 7-day success-vs-error
chart — from a snapshot refreshed by the existing `*/10` cron; and the ops2 header
bubble shows a count that is 1 when the AI budget is red and 0 when it is not,
tapping through to Attention.

### Vocabulary this spec uses

- **Parse** — one uploaded document taken through AI parsing. One document == one
  parse, regardless of how many job-claim generations or model requests it took
  (grill decision 4). Ops-triggered building-model runs are not parses for counting
  purposes; they still consume money, and the money numbers cover them because
  Cloudflare is the money source.
- **Errored parse** — its claim is terminally `failed`, **or** it is `processing`
  with a claim older than 30 minutes (the lease-expired-with-attempts-exhausted gap
  in `worker/lib/ai/jobs.ts`: such a row is never retried and never marked failed).
  One SQL predicate (grill decision 9).
- **Successful parse** — a parse whose claim reached its terminal success state.
- **Snapshot** — the KV-stored record of the Cloudflare money numbers plus the D1
  counts, written by the cron, read by the page and the bubble.
- **Money numbers** — credit balance, billed spend, spend cap. Cloudflare is their
  only source of truth (grill decision 5); D1 cost columns are never used for them.
- **Red** — the single v1 notification source: credit balance below the floor **OR**
  cap used above the ceiling (both from wrangler `vars`).

---

## 2. Acceptance criteria

All criteria are independently verifiable. "Attention page" = the ops2 `/attention`
route, which stops being a `DestinationRoot` placeholder and becomes a card container.

### Cards — money (Cloudflare-sourced)

1. **Given** a snapshot exists with a credit balance of `12.34` USD, **when** Staff
   opens the Attention page, **then** the credit balance card shows `$12.34` and no
   Cloudflare API call is made during the page load.

2. **Given** a snapshot exists with billed spend `8.00` and cap `20.00`, **when**
   Staff opens the Attention page, **then** the cap outstanding card shows the
   remaining headroom `$12.00` and the cap it was measured against (`$20.00`),
   neither figure hardcoded.

3. **Given** the snapshot's cap came from the per-gateway `spend_limits.rules` of
   `openframe-estimator`, **when** the cron runs and that gateway call fails,
   **then** the cron falls back to the account-level
   `/ai-gateway/billing/spending-limit` endpoint and the snapshot records which
   source supplied the cap.

4. **Given** no Cloudflare API token is configured, **when** the cron runs, **then**
   the snapshot records the money numbers as unavailable, **and** the Attention page
   renders the two money cards in an "unavailable" state — not zero, not red — while
   the count cards and chart still render their D1 numbers.

5. **Given** the Cloudflare API returns a non-2xx or times out, **when** the cron
   runs, **then** the previous snapshot's D1 counts are still refreshed, the money
   fields go to unavailable, the failure is logged, and the page still loads
   (no error page, no spinner that never resolves).

6. **Given** a snapshot older than 30 minutes (cron not running), **when** Staff
   opens the Attention page, **then** each card states the age of the figures
   ("as at HH:MM") so a stale number is never read as a live one.

### Cards — parse counts (D1-sourced)

7. **Given** 40 documents parsed successfully and 3 failed in the last 7 days,
   **when** Staff opens the Attention page, **then** the success card shows `40` and
   the error card shows `3`.

8. **Given** one document whose parse was retried three times before succeeding,
   **when** the 7-day counts are computed, **then** it counts as exactly one success
   and zero errors (one document == one parse).

9. **Given** a claim in `processing` whose row is 31 minutes old with attempts
   exhausted, **when** the 7-day counts are computed, **then** it counts as one
   error.

10. **Given** a claim in `processing` that is 5 minutes old, **when** the 7-day
    counts are computed, **then** it counts as neither a success nor an error (still
    in flight).

11. **Given** an ops-triggered building-model run in the window, **when** the 7-day
    counts are computed, **then** it is excluded from both counts and from the chart.

12. **Given** no parses at all in the last 7 days, **when** Staff opens the Attention
    page, **then** the count cards show `0` and the chart renders an empty state —
    not an error, not a blank box.

### Chart

13. **Given** parses spread across the last 7 days, **when** Staff opens the
    Attention page, **then** the chart shows 7 day-buckets, each with its success and
    error counts, and the sum of the buckets equals the two count cards.

14. **Given** a day within the window with zero parses, **when** the chart renders,
    **then** that day appears as a zero bucket, not as a missing day.

### Notification bubble

15. **Given** the snapshot is not red, **when** Staff loads any ops2 page, **then**
    the header bubble shows a count of 0 (no bubble drawn).

16. **Given** the snapshot's credit balance is below the configured floor, **when**
    Staff loads any ops2 page, **then** the bubble shows `1`.

17. **Given** the snapshot's cap-used percentage is above the configured ceiling,
    **when** Staff loads any ops2 page, **then** the bubble shows `1` — and if the
    balance is *also* below the floor, still `1` (one source, one notification).

18. **Given** the bubble shows a non-zero count, **when** Staff taps it, **then** the
    app navigates to the Attention page.

19. **Given** money numbers are unavailable, **when** the bubble is computed, **then**
    the count is 0 — an unavailable number never produces a red (no false alarms).

20. **Given** the notification count is assembled from a source list, **when** a
    second source is added later (orders needing attention, customer messages),
    **then** it appends to that list without changing the bubble, the aggregation, or
    the Attention page container — verified by the design's source interface having
    exactly one v1 implementation and no source-specific branching in the aggregator.

### Freshness / cron

21. **Given** the existing `*/10` cron, **when** it runs, **then** it fetches the
    Cloudflare money numbers, computes the D1 counts and chart buckets, and writes
    one snapshot to KV — and adds no new cron trigger.

22. **Given** two ops2 pages are open, **when** both load, **then** neither triggers
    a Cloudflare API call; both read the same KV snapshot.

### Abuse cases (negative — the tester executes these for real)

The snapshot carries account-level financial data (AI spend, credit balance) and the
Cloudflare API token is a Worker secret.

23. **Given** a signed-out visitor, **when** they request the monitoring snapshot
    endpoint, **then** the response is 401/403 and contains no balance, spend, cap or
    count values.

24. **Given** a signed-in Customer (non-staff account), **when** they request the
    monitoring snapshot endpoint, **then** the response is 403 and contains no
    monitoring data.

25. **Given** a signed-in Manufacturer partner account, **when** they request the
    monitoring snapshot endpoint, **then** the response is 403 and contains no
    monitoring data.

26. **Given** any request at all, **when** the snapshot endpoint responds, **then**
    the payload contains no Cloudflare API token, no account id, and no gateway
    credentials — only the derived numbers, their source label and the snapshot
    timestamp.

27. **Given** a Cloudflare API failure, **when** it is logged, **then** the log line
    contains no token and no Authorization header value.

28. **Given** a Customer who guesses the ops2 `/attention` route, **when** they load
    it, **then** they are refused by the same ops2 staff guard every other ops2
    surface uses — no new auth path is introduced for this page.

---

## 3. Out of scope

Carried from the grill, unchanged:

- Email/push alerts; any amber warning tier.
- Error drill-down rows, per-quote error lists, any click-through from a card.
- Live queue-depth / DLQ introspection (`queueBacklogAdaptiveGroups` noted, not built).
- AI Gateway GraphQL analytics (`aiGatewayRequestsAdaptiveGroups`) — only if billed
  usage-history proves insufficient.
- Notification persistence, dismissal, read-state.
- Any change to the parse pipeline itself — including *fixing* the stuck-`processing`
  gap. This feature counts that state as an error; it does not retry, reap or repair it.
- Any custom Cloudflare dashboard, worker-analytics page, or reuse of sampled CF logs
  as a data source.
- Any customer-facing surface.

---

## 4. Assumptions (vetoable)

- **ASSUMED:** initial red thresholds — credit balance floor **$5.00 USD**, cap-used
  ceiling **80%**. Both live in wrangler `vars` per grill decision 8, so changing them
  is a config edit, not a rebuild. Vetoable by naming different numbers.
- **ASSUMED:** the 7-day window is a rolling 7×24h ending now (not calendar days,
  not "this week"), and chart buckets are days in the ops account's local time
  (Australia/Melbourne) so a "day" matches what an owner means by a day.
- **ASSUMED:** money is displayed in USD as Cloudflare reports it, with no AUD
  conversion. A converted figure would need an FX source and would be a second money
  fact — out of scope.
- **ASSUMED:** "cap outstanding" means remaining headroom (cap minus billed spend for
  the current billing period), which is the figure that answers "about to run out".
- **ASSUMED:** the Attention page's existing "what needs a person" content leads and
  the five cards sit below it, per the grill's amendment ("cards allowed; what needs a
  person still leads"). With no such content in v1, the cards are the page.
- **ASSUMED:** a stale snapshot is displayed with its timestamp rather than suppressed
  — an old number labelled old beats an empty page (criterion 6).
