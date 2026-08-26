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

---

# Running it with herdr

Herdr is a terminal workspace manager: persistent panes that survive closing the
terminal. That last property is the one that matters here — a build stage can run
40 minutes, and v1 lost two ~100-minute agent runs to a machine restart.

## One-time setup

None. Herdr's installer already puts `%LOCALAPPDATA%\Programs\Herdr\bin` on the
**User** PATH. Open a **new** terminal and `herdr --version` prints `herdr 0.8.2`.

If a shell says `herdr` is not found, it is almost certainly a terminal (or an
editor, or a Claude Code session) started *before* herdr was installed, still
holding the old environment block. Restart it rather than editing PATH.

> Do not "fix" this by appending `$env:Path` to the User scope. `$env:Path` is
> the resolved process PATH — machine plus user plus whatever the session added
> — so writing it back into the User scope permanently duplicates the entire
> machine PATH into it. If you ever do need to add something, read the User
> scope specifically:
>
> ```powershell
> $p = [Environment]::GetEnvironmentVariable('Path','User')
> ```

## The layout

```bash
herdr
```

That launches or re-attaches the persistent session. Split it into three panes —
the split keys are in herdr's own help, or from inside a pane:

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
```

| pane | what runs there | why |
|---|---|---|
| **conductor** | `node scripts/pipeline/conduct.mjs ...` | stages stream their tool calls here; this is where you work |
| **grill** | `claude` → `/grilling` | stage 0 is the one stage that talks to you |
| **scratch** | `npm run dev`, `git log`, opening the mock | so you never interrupt the conductor to look at something |

Nothing about the pipeline *requires* herdr — the conductor is a plain Node
script. Herdr buys persistence, and somewhere to put the grill and the dev server
that isn't the pane the pipeline is streaming into.

## A full feature, start to finish

**1. Grill it** — in the grill pane:

```bash
claude
```

Then `/grilling` and paste the ask. Stress-test the idea, and pin down which
actor in `CONTEXT.md` this serves. When it's done, paste the conclusions and the
actors-and-needs section into `docs/runs/<slug>/00-ask.md` (created by step 2).

**2. Start the run** — in the conductor pane:

```bash
node scripts/pipeline/conduct.mjs start my-feature "the one-line ask"
node scripts/pipeline/conduct.mjs ui on
```

`ui on` only if the feature adds or changes UI; it enables the ux and polish
stages and the mock gate.

**3. Drive it.** Repeat until it tells you otherwise:

```bash
node scripts/pipeline/conduct.mjs next
```

Each call runs one stage and stops. You will be stopped at three kinds of gate:

- **A decision.** The stage wrote `DECISIONS.md` and stopped. Answer inline —
  put `A: ...` under each question — then `conduct answer`, which resumes that
  same stage warm rather than paying to boot a new one.
- **The mock.** Open `docs/mocks/<slug>.html` in the scratch pane. Not happy?
  Write what you want into `03-ux.md` and `conduct run ux`. Happy? `conduct next`.
- **Sign-off.** `08-accept.md` is a recommendation, not a decision.

**4. Route any findings.** Reviewers report; only the developer fixes:

```bash
node scripts/pipeline/conduct.mjs fix "the finding, or the review file path"
node scripts/pipeline/conduct.mjs run verify
```

**5. See what it cost:**

```bash
node scripts/pipeline/conduct.mjs report
```

## If a stage goes wrong

- **It stopped on its budget ceiling.** The line says so. Either the work needs
  splitting into more tasks, or raise that stage's `budget` in `STAGES`.
- **It didn't write what it promised.** The conductor says which file is missing.
  Just `conduct run <stage>` again — stages are re-runnable.
- **A build task failed.** `docs/runs/<slug>/logs/build-<task>.jsonl` is the full
  transcript. Fix the task's entry in `02-tasks.json` and re-run `build`;
  completed tasks are skipped via `tasksDone`.
- **Codex failed for infrastructure reasons** (network, quota, auth). That is not
  a clean review. Retry once, and if it fails again say the work is unreviewed —
  never present it as reviewed.
