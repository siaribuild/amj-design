# Pipeline v2 — same team, no orchestrator

v1's agents, stages, gates and guardrails are unchanged. What changed is **who
conducts them**. In v1 a Claude session did the conducting; in v2
`scripts/pipeline/conduct.mjs` does, and it is not a model.

## Why

Measured over one feature, by role:

| role | runs | context tokens | output |
|---|---|---|---|
| developer | 12 | 2.18B | 3M |
| **main threads (orchestrator)** | **3** | **2.17B** | **5M** |
| tester | 5 | 772M | 849k |
| ux-designer | 4 | 717M | 1M |
| architect | 12 | 219M | 1M |
| product-manager | 6 | 169M | 2M |
| ui-designer | 4 | 167M | 457k |
| general-purpose | 8 | 45M | 208k |

Two things to read out of that.

**The orchestrator cost 2.17B context tokens to produce 5M of output** — a
434:1 ratio, for work that is in substance a state machine: run the next stage,
check the artifact exists, relay a question to the human, route a finding. v1's
own rule made it worse by design — *"Pass each agent the previous agent's
output"* meant every artifact travelled through the orchestrator's context and
was then re-sent on every subsequent turn.

**But the orchestrator was not the biggest line — `developer` was.** Removing
the orchestrator alone would have fixed about a third. The other two thirds are
the same disease in a different host: *context tokens are the sum of context
re-sent on every turn*. A session on a 1M window that grows toward full and runs
for hundreds of turns pays that sum quadratically. 2.18B ÷ 12 developer runs is
**182M per run**.

So v2 pulls three levers, in measured order of impact:

1. **Cap the context window per stage** (`--autocompact 100–120k`). This applies
   to every role at once. An uncapped 1M window is what turns a long run into
   182M; the cap takes a straight multiple off the dominant term.
2. **Delete the orchestrator.** The conductor is a script. Zero tokens, and its
   cost does not grow with the feature because artifact *contents* never pass
   through it — stages are handed **paths**, and read for themselves.
3. **Slice long roles into short scoped runs.** The architect now emits
   `02-tasks.json`, and the conductor runs **one developer session per task**.
   Splitting an N-turn run into k runs divides its quadratic term by k. Each
   task is handed exact file paths, so the developer never searches — which is
   what the "94% re-read context" figure actually was.

Plus a hard `--max-budget-usd` ceiling per stage, so a runaway stops and says so
instead of quietly spending 182M tokens.

### Measured on the smoke test

| stage | cost | context | output | time |
|---|---|---|---|---|
| spec (product-manager) | $0.54 | 110k | 4k | 67s |
| design (architect) | $4.11 | 556k | 17k | 368s |

For comparison, v1's per-run averages were 28M (product-manager) and 18M
(architect). The smoke-test feature was simpler than a real one, so treat the
ratio as directional, not as a promise — the mechanism, not the multiple, is the
claim: the spec stage made **3 tool calls**, because it was told which three
files to read.

## A side effect worth having

In v1 the Codex stop-gate was structurally blind: it inspects *the main agent's
turn*, and orchestrated work leaves no edits there. Measured 2026-08-20: 50 gate
jobs, 50 ALLOWs, zero files read.

In v2 every stage is its own top-level session, so a stage that edits code
*is* the main turn. The gate sees it. The v1 blindness is fixed by the
architecture rather than by remembering to work around it — and the explicit
end-of-feature review still runs as the `review` stage regardless.

## Stages

    spec → design → [ux] → build → [polish] → verify → review → accept

`[ux]` and `[polish]` run only when the feature touches UI (`conduct ui on`).
Each stage runs as `claude -p --agent <role>` against the **unmodified**
`.claude/agents/*.md` definitions — v2 does not fork the agents.

| stage | agent | writes | ceiling |
|---|---|---|---|
| spec | product-manager | `01-spec.md` | $4 |
| design | architect | `02-design.md`, `02-tasks.json` | $5 |
| ux | ux-designer | `03-ux.md`, `docs/mocks/<slug>.html` | $4 |
| build | developer × N tasks | `04-build.md` | $8 |
| polish | ui-designer | `05-polish.md` | $3 |
| verify | tester (own worktree) | `06-verify.md` | $6 |
| review | architect + security + ponytail + codex, **in parallel** | `07-review-*.md` | $10 |
| accept | product-manager | `08-accept.md` | $3 |

**Grill (stage 0) is not conducted.** It is the only stage that talks to you, so
you run it yourself in a herdr pane and paste its conclusions into `00-ask.md`.

**Verify runs in its own git worktree.** A tester mutating beside a developer
makes red tests nobody can attribute.

**Review fans out in parallel.** The four reviewers are read-only and
independent, so they run concurrently — wall-clock, not just tokens.

## Gates

Same three gates as v1, enforced by the conductor rather than remembered by a model.

- **Decision gate.** A stage with an owner-only question writes `DECISIONS.md`
  and stops. You answer inline (`A: ...` under each question) and run
  `conduct answer`, which **resumes that stage warm** via `--resume` — it keeps
  its context instead of paying to boot again. This is v1's "warm agents, never
  fresh spawns" rule, mechanised.
- **Mock gate.** No implementation until you have seen and approved
  `docs/mocks/<slug>.html`. There is no assumption fallback; the pipeline waits.
- **Sign-off.** `08-accept.md` is a recommendation. Shipping is yours.

The conductor also checks each stage actually wrote what it promised. A design
that names a test file which never gets created was v1's most-repeated failure —
`02-tasks.json` must list every named test file, and the conformance reviewer
re-checks every path in it against the diff.

## Guardrails — unchanged

Probity TDD, agent-guard, the security-guidance plugin and ponytail all still
apply: they are project/user hooks, and every stage is an ordinary Claude
session in this directory. The developer stage is still held to red-green.

## Rollback

`docs/pipeline/v1-backup/RESTORE.md`. v2 touched no agent, hook, setting or
probity config — only `CLAUDE.md` — so rollback is one `cp`. Git tag:
`pipeline-v1`.

## Tuning

Everything worth turning is in the `STAGES` table at the top of
`scripts/pipeline/conduct.mjs`:

- `compact` — the context cap. Lower is cheaper and more forgetful. If a stage
  starts losing the thread mid-run, raise it before blaming the prompt.
- `budget` — the hard dollar ceiling. A stage that hits it says so.
- `model` — unset means the agent's own frontmatter model. Set it to force a
  cheaper tier for a mechanical stage.
- `mcp` — off by default; the Sanity/Chrome tool definitions are paid for on
  every turn of every stage that never uses them. On for the UI stages.

After each run, `conduct report` prints the split. If a role is disproportionate,
that is the next thing to slice.
