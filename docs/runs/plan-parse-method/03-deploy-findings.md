# Plan-parse enrichment — deploy record & live findings (2026-08-29)

Spec/design: [`01-spec-v2.md`](01-spec-v2.md), [`02-design-v2.md`](02-design-v2.md). This
file is the record of getting it to production and what happened once real traffic hit it —
not a replacement for either.

## What shipped

All 7 slices (S1–S7) of the drawing-enrichment pipeline: container wire contract, crop
lifecycle, the Python/poppler container, page selection, elevation/floorplan/opening
skills, assignment, readings + release gate (`scripts/drawing-gate.mjs`).

- **Migration** `0060_drawing_reading.sql` — `drawing_reading` table + `ai_runs.drawing_report_json`.
  Additive, applied to remote D1.
- **Container** `apertly-planparsecontainer`, image
  `registry.cloudflare.com/c3834ff3509fa7cb4c9769a6dee6c2d8/plan-parse:d3c2ee176ac23e914771b02d061eea5c721bf2ae`,
  built/pushed by `.github/workflows/container-build.yml` (fixed this session — the
  Cloudflare registry needs a token-exchanged short-lived credential, not the API token
  as a direct password; see the workflow's `Push` step and `worker/lib/drawing/containerClient.ts`).
- **Worker** deployed with `AI_EXTRACTION_MODE: "auto_drawings"` — the feature is live, not
  just merged.

## Explicit process deviations (owner-approved, not silent)

- **Merged and deployed without the four mandatory review layers** (architect conformance,
  `/security-review`, ponytail-review, Codex) — owner's explicit call, trading review
  coverage for a working, testable deployment now. Codex review specifically was later
  requested and run separately (token-free); the other three remain outstanding.
- Sizing/gate note: this reverses the standing house rule that review gates run before
  deploy. Logged here so it isn't mistaken for an oversight.

## Bugs found and fixed post-deploy (all TDD, all green)

1. **[`containerClient.ts`](../../../worker/lib/drawing/containerClient.ts)** — every
   container call now races against `AbortSignal.timeout()`, default
   `CONTAINER_CALL_TIMEOUT_MS = 600_000`. Previously `stub.fetch()` had no timeout at all —
   a stalled call could hang the whole job silently.
2. **[`jobs.ts:49`](../../../worker/lib/ai/jobs.ts)** — the `auto_drawings` job lease raised
   240s → 600s, to match, and because 240s had already killed one real run mid-flight
   (see incident below).
3. **[`useProjectDocuments.ts:81`](../../../src/data/useProjectDocuments.ts)** — the
   "reading your drawings · opening N of total" checklist row now holds visible as the
   current row until the stage genuinely advances, instead of snapping to "Checking
   thermal requirements" the instant the counter reached its total. Confirmed separately
   that a completed row also stays checked-off with its final count for the rest of the
   run (`DocumentProgress.tsx` renders the full step list every time, not just the current
   row).

## Open finding — NOT fixed, needs more diagnosis

**Two consecutive real end-to-end test runs against production have never once reached the
per-opening read loop.** Confirmed by querying `ai_job_claim` directly: `drawings_total`
stayed `NULL` for the entire duration of both runs. That column is written from exactly one
call site — `setDrawingProgress` inside the per-opening `tick()` in `enrichFile`
([`enrich.ts:166`](../../../worker/lib/drawing/enrich.ts)) — which only runs after the
elevation-page and floorplan-page render + model-read block
([`enrich.ts:127-157`](../../../worker/lib/drawing/enrich.ts)) completes. So both runs stalled
*before* that point, not during the per-opening loop as first suspected.

- **Run 1** (14:20:53–14:24:53): killed by the (then 240s) job lease. `drawing_report_json`
  never persisted. `error_code` null, `ai_job_claim.last_error = "ai_processing_deadline_exceeded"`.
- **Run 2** (started 14:49:37, post-deploy of the fixes above): still `status: processing`
  minutes later, lease being renewed (so the invocation is alive), `drawings_total` still
  null throughout. Not yet resolved when last checked.

**Retracted theory**: I initially concluded the first run's fast-moving "X of 19" meant
every opening resolved `not_read` near-instantly. The claim-table evidence contradicts
this — `drawings_total` was never set even once in run 1 either. The "19" the user saw was
most likely the schedule extraction's own opening count shown elsewhere in the UI, not this
counter. Recorded so this dead end isn't re-walked.

**Plausible contributing factor, unconfirmed**: `wrangler deploy` resets any live Durable
Object whose backing code changed (`Durable Object reset because its code was updated`,
seen in the tail at 12:48:02am, ~90s before run 2 started) — so run 2's first container call
hit a cold-starting instance. Two-for-two failures at the exact same point weakens this as
the *whole* explanation though; a cold start shouldn't stall for 5+ minutes.

**Next diagnostic step (not yet taken)**: probe the container directly (a raw `/inspect`
call against the DO, or `wrangler containers` instance logs) to see whether it is answering
requests at all, rather than continuing to infer purely from the Worker side.

## Still outstanding (unchanged from before this deploy)

- Architect conformance, `/security-review`, and `ponytail-review` — not run, owner's
  explicit call, not forgotten.
- AI Gateway rate limit raised by the owner to 60 req/min (was 20) — resolves the earlier
  concern about ~22–24 calls per real run, unrelated to the stall above.
- The REF walk (owner-confirmed label sheet → `drawing-gate.mjs`) hasn't run against a real
  production reading yet — blocked on the stall above producing an actual reading first.
