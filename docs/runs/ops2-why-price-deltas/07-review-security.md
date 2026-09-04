# Security review — ops2-why-price-deltas

> **This file is the review report, parked here because plan mode blocked the
> intended write.** Its home is `docs/runs/ops2-why-price-deltas/07-review-security.md`;
> the Write to that path was refused with "Cannot write ... while in plan mode".
> Copy it there verbatim to complete the `review` stage.

Branch `feat/ops2-why-price-deltas`, diff against `9cb41bfd` (merge-base `1e83b220`).
Scope reviewed: the 12 branch commits, restricted to code — `src/`, `worker/`,
`scripts/pipeline/`. Documentation, mocks and test files excluded per the
review's own exclusion rules.

## Findings

**No security findings above the ~80% confidence bar.**

## What was examined, and why it clears

**The one new data flow.** `deltaToSelected` (a raw dollar amount) is now
allow-listed across the rationale boundary in `worker/lib/estimator/rationale.ts:68`
and rendered by `src/ops2/projects/WhyDetail.tsx`. This is the only change that
moves commercial data to a new surface.

- The endpoint is unchanged and remains gated: `worker/routes/ops.ts:741-749`
  requires `resolveStaff` and `hasAssignedRole`, returning 403 for each, and
  `lineRationale` scopes the read through the project in its single entry
  SELECT, so a line in another project is indistinguishable from a line that
  does not exist.
- The DTO type (`src/data/rationale.ts`) is consumed only by `worker/routes/ops.ts`
  and `src/ops2/**` — grep confirms no customer-facing surface reads it. No new
  route, no new parameter, no widening of the account scope.
- The field remains additive from an allow-list rather than a spread of the
  stored `CandidateOutcome`, so exclusions and the learned layer still cannot
  leak by accretion when someone adds the next outcome field.

**XSS.** `deltaText` / `deltaLabel` (`src/ops2/projects/whyCopy.ts:390-414`)
produce strings rendered as React children and as an `aria-label`. No
`dangerouslySetInnerHTML`, no `innerHTML`, no URL sink. `Number.toLocaleString`
output is not markup.

**Class-name composition.** `OpenablePanel` (`src/ops2/chrome/OpenablePanel.tsx:84`)
and `SidePanel` (`src/ops2/chrome/SidePanel.tsx:183`) now interpolate a modifier
into `className`. Both inputs are compile-time literals from call sites, never
request data or user content; there is no CSS-injection path.

**Provider-call budgeting** (`worker/lib/drawing/fullDocumentAgent.ts`) changes
arithmetic on internal call limits only — no auth, no input parsing, no external
data crossing a trust boundary.

**Pipeline tooling** (`scripts/pipeline/conduct.mjs`): `readTasks`, `checkSpec`,
`fixSpec`. Developer-machine scripts reading repo-local files with `JSON.parse`
and regexes; not deployed, not reachable by untrusted input.

**Not code, excluded by rule:** `scripts/probe-why-abuse.mjs` is a hand-run
local abuse probe (untracked, test-only, builds SQL from literals it authored
itself against a local D1 with a placeholder wrangler token). `scripts/tests/**`
and `docs/**` likewise.

## Method note

Run headless under `--permission-mode plan`, so the diff was read via read-only
git and file reads; no sub-agents were dispatched (pipeline stage rule).
