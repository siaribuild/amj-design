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

**There is no runaway guard, and that is a ruling, not an omission.** An early
version had a per-stage `--max-budget-usd` ceiling; the owner deleted the concept
outright. No threshold is defensible — a large feature's build stage legitimately
outspends a small feature's entire run, so any number either fires on healthy
work or never fires at all. The subscription's 5-hour window is the only
externally-enforced ceiling that exists, and a stage running in a pane in front
of you is the guard. Dollars are gone with it: the conductor prints tokens and
time, never currency. Do not reintroduce a ceiling under another name.

### Measured on the smoke test

| stage | context | output | time |
|---|---|---|---|
| spec (product-manager) | 110k | 4k | 67s |
| design (architect) | 556k | 17k | 368s |

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

## Proportionality — the ceremony is bounded

`CLAUDE.md` has always defined three sizes of change. Until now the conductor
implemented one: every run got all 8 stages, all 4 reviewers, and an adversarial
verify, whatever its blast radius.

Measured on the feature that built this pipeline (subagent tokens):

| | tokens | share |
|---|---|---|
| build (9 tasks) | ~1.41M | 41% |
| **fix rounds (6)** | **~0.92M** | **27%** |
| testers (2) | ~0.48M | 14% |
| architect (2) | ~0.37M | 11% |
| PM (2) | ~0.17M | 5% |

Testing was 14%. The **fix rounds were 27%** — and they were triggered by
findings like "a test is missing for code that already works" and a
column-alignment cosmetic. Each such finding spawns a fresh developer session,
so a low-value finding costs more than the testing that produced it. Left
unaddressed, that mindset makes v2 as expensive as v1 by a different route.

Four bounds, all in the conductor:

**1. Tier, chosen at `start`.**

    conduct start <slug> "<ask>" --tier full|fix|direct

| tier | runs | for |
|---|---|---|
| `full` (default) | every stage; `review` **mandatory** | a business rule or capability, DB schema, multiple concerns, or a question only the owner can answer |
| `fix` | `build` + `verify` only | a bounded fix whose correct behaviour is already unambiguous |
| `direct` | nothing — refuses to create a run | typos, copy, comments, config values, formatting |

In tier `fix` there is no architect, so nothing slices the build: `00-ask.md`
*is* the task, and `build` is one developer session against it — still
test-first, because Probity does not care what tier a change was sized at. For
the same reason its `verify` checks the work against `00-ask.md`; `01-spec.md`
belongs to a stage this tier never runs.

Membership is declared on the stage (`tiers: [...]`), not written into `next` as
a skip: a skip at the call site is invisible from the stage table and gets
re-derived, differently, in `plan`. `review` is in tier `full` and cannot be
waived there — neither a manual override nor the conductor's judgement may
disable it. Only `fix` is without it, and the owner selects that tier
deliberately.

**2. Verify depth follows blast radius.** The `verify` prompt branches on the
real diff against `run.base`. Sensitive = any changed path under `worker/**`,
`src/data/**`, `migrations/**`, or naming auth / payment / payout / session.

- Sensitive → the full adversarial pass: edge cases, mutation-tested guards,
  every negative abuse criterion executed for real.
- Not sensitive → run the gates, walk the acceptance criteria, report; and an
  explicit instruction **not** to mutation-test guards, **not** to hunt for
  missing tests on code that already works, and not to raise cosmetics.

It fails closed: a diff that cannot be read, or an empty one, is sensitive. The
depth lives in the stage prompt, conditioned on the diff — not in whatever the
operator happens to type that day, which is how the ceremony leaked in.

**3. Severity gate on findings.**

    conduct fix "<finding>" --severity high|medium|low|cosmetic

`low` and `cosmetic` are appended to `docs/runs/<slug>/DEBT.md` and printed —
visible, never silently dropped. `high`, `medium`, and a finding with **no**
severity all spawn the developer session as before: the gate defers, it never
assumes.

**4. Cycle cap.** `run.json` counts **both halves** of the loop: `verifyRounds`
and `fixRounds`. The budget for a run is 2 verifies and 3 fix sessions — one
verify, the fixes its findings need, one re-verify. Whichever runs out first,
the next session of that kind is refused: the conductor prints what is still
open (the debt file, the last verdict) and stops.

Counting only the verifies would cap the cheap half. A verify is one tester; a
round of findings is one developer *each*, and the six fix rounds on this
pipeline's own build were 27% of the feature — more than testing itself. Three
is what one verify's worth of high/medium findings takes on a bounded change;
the fourth is the signal to stop and look. A fix session is counted before it
starts, so one that crashes has still spent its budget.

This is a **cycle** ceiling. It is not a token, dollar or turn ceiling — the
stage table's no-runaway-guard ruling is about the cost of a *running stage*,
and still stands.

## Stages

    spec → design → [ux] → build → [polish] → verify → review → accept

`[ux]` and `[polish]` run only when the feature touches UI (`conduct ui on`).
Each stage runs as `claude -p --agent <role>` against the **unmodified**
`.claude/agents/*.md` definitions — v2 does not fork the agents.

| stage | agent | writes |
|---|---|---|
| spec | product-manager | `01-spec.md` |
| design | architect | `02-design.md`, `02-tasks.json` |
| ux | ux-designer | `03-ux.md`, `docs/mocks/<slug>.html` |
| build | developer × N tasks | `04-build.md` |
| polish | ui-designer | `05-polish.md` |
| verify | tester | `06-verify.md` |
| review | architect + security + ponytail + codex, **in parallel** | `07-review-*.md` |
| accept | product-manager | `08-accept.md` |

**Grill (stage 0) is not conducted.** It is the only stage that talks to you, so
you run it yourself in a herdr pane and paste its conclusions into `00-ask.md`.

**Verify runs inline, same directory as every other stage** — no worktree.
It did, once: "a tester mutating beside a developer makes red tests nobody can
attribute." Owner ruling supersedes it: no parallel development, one directory,
one branch at a time, so that scenario cannot arise anywhere in this repo, and
the worktree was only ever defending against it. Removed after it cost two live
defects on its own — `docs/runs/<slug>/*` besides `04-build.md` is untracked
and invisible in a worktree checkout, and `node_modules` is never provisioned
there, which also broke the Probity shim's own resolution and denied every
Bash call regardless of target.

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

`docs/pipeline/v1-backup/RESTORE.md`. v2 drives the same agent definitions from
the outside, so rollback is one `cp` of `CLAUDE.md`. Git tag: `pipeline-v1`.

Still true after pane mode: `git diff --stat <branch-point>..HEAD -- .claude/agents/`
is **empty** — pane mode changed nothing about how an agent is defined, only where
its process runs. One caveat the snapshot cannot express: `.claude/hooks/probity-subagent-shim.mjs`
*has* moved since the backup was taken (a separate fix — resolving `node_modules`
from a single cwd bricked sessions), so restoring the hooks copy would reintroduce
that bug. Restore `CLAUDE.md`; leave the hook alone unless you know why you are
reverting it.

## Tuning

Everything worth turning is in the `STAGES` table at the top of
`scripts/pipeline/conduct.mjs`:

- `compact` — the context cap. Lower is cheaper and more forgetful. If a stage
  starts losing the thread mid-run, raise it before blaming the prompt.
- `model` — unset means the agent's own frontmatter model. Set it to force a
  cheaper tier for a mechanical stage.
- `mcp` — off by default; the Sanity/Chrome tool definitions are paid for on
  every turn of every stage that never uses them. On for the UI stages.

After each run, `conduct report` prints the split. If a role is disproportionate,
that is the next thing to slice.

## Where the numbers come from

`measure.mjs` is the only accounting mechanism, in both modes. Three things about
it are easy to get wrong and expensive to get wrong:

- **Each API response is counted once, keyed by `requestId`.** A transcript
  writes one assistant record per *content block*, and every block of one
  response repeats the same `usage`. Summing records naively overcounted by
  **2.6×** in practice — which is also why a stage's own result JSON understates
  a run: it reports the last message, not the run.
- **A stage is metered by its recorded session id**, reading
  `<projectsDir>/<proj>/<sid>.jsonl` plus `<sid>/subagents/*.jsonl` — never by
  scanning for the newest transcript, which is unattributable the moment two
  sessions run at once. Interruption does not lose spend: a stage totals its
  current session plus every id in `previousSessions`.
- **`unknown` is not `0`.** A row prints `unknown` when nothing on disk can
  account for it; a printed zero means measured zero.

`conduct report` also prints machine-wide **window** figures — the 5-hour window
and the trailing 7 days — anchored on the last `rate_limit_event` found in this
repo's own stage logs (the event exists only in stream-json logs, never in
transcripts, and carries a reset time but **no quota figure**). So there is no
percentage, no "remaining", no headroom, and there cannot be one; unanchored, the
window is labelled trailing. Within 15 minutes of a reset a stage start prints an
advisory and starts anyway — it never gates.

---

# Running it with herdr

Herdr is a terminal workspace manager: persistent panes that survive closing the
terminal. That last property is the one that matters here — a build stage can run
40 minutes, and v1 lost two ~100-minute agent runs to a machine restart.

**Pane mode is built, and it is the default.** Detection is a fast
`herdr workspace list` — a real call to the server, not an env-var check, because
the conductor also runs from *outside* a pane where `HERDR_ENV` is unset. Herdr
answering ⇒ every stage launches as a pane agent; herdr absent, down, or
`--no-panes` ⇒ one line naming the reason and today's headless `-p` path, whose
artifacts are byte-identical. Everything below describes what the conductor
actually does now, not a way of working you assemble by hand.

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

## Two machine-level hazards, neither of them in this repo

**1. There are now two Claude Code installs, and they are already drifting.**
This session's own Claude runs inside the packaged MSIX desktop app, which
redirects `%APPDATA%` into
`AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming` — so an
`npm install -g` from there lands *inside the container*. Panes are ordinary
unpackaged processes reading the real `Roaming`, and use the real npm prefix.
Measured 2026-08-26: **2.1.232 containerised, 2.1.246 in the real prefix.** They
are separate installs with separate auth. Pane auth works today; keep it that
way, because **Probity's validator shells out to the CLI** — if the pane-side
login lapses, the TDD gate errors instead of gating, which is a failure mode that
looks like a broken build rather than a missing guardrail.

**2. herdr 0.8.2 cannot launch `claude` with native args on Windows.**
`herdr agent start <label> --kind claude --pane <p> -- <native args>` launches via
`Start-Process -FilePath claude`, which resolves the extensionless npm **bash**
shim before honouring `PATHEXT`, and dies with `%1 is not a valid Win32
application` → `{"error":{"code":"timeout"}}`. Verified directly: `-FilePath
claude` fails, `-FilePath claude.cmd` prints the version. With **no** `--` args
herdr types `claude` at the prompt instead, which works — which is exactly why the
bug only shows up once you pass native args, i.e. `--session-id`, `--agent` and
`--autocompact`, i.e. everything pane mode depends on.

Worked around **outside the codebase**, so nothing in the repo will remind you:
a `claude.cmd` forwarder in `%LOCALAPPDATA%\Programs\claude-shim`, placed earlier
on the **User** PATH than the npm prefix. It takes effect only after the herdr
**server** restarts — a new pane inherits the old server's environment. If every
stage is silently falling back to headless, check this first.

## The cockpit

`conduct start` builds a skeleton workspace and nothing more (panes cost RAM; a
pane per stage would leave ~13 idle claude processes alive by the end of a run):

| pane | what runs there |
|---|---|
| **plan** | `conduct plan` on a 5-second loop — the run's state |
| **diff** | `git --no-pager diff --stat <base>...HEAD` on the same loop |
| **role panes** | created on demand, **one per agent role**, reused |

A role pane is reused, never re-prompted: the next stage for that role always
boots a *new* claude with a *new* session id, so context stays isolated and
metering stays per-stage. When a stage finishes the conductor types `/exit` and
leaves the pane open — scrollback intact, no idle process holding memory. Nothing
ever steals focus (`--no-focus` on every create and split).

The conformance and ponytail reviewers get panes, split off the plan pane. The
design asked for them in a second tab so the main tab keeps a readable geometry;
**that was not built** — the tab helper belongs in `herd.mjs`, which was outside
the reviewer task's file list. Reviewer panes in one tab is cramped, not wrong.
`/security-review` stays a headless `-p` child in *every* mode (it is compiled
into the CLI, so no pane-safe delivery fires it reliably), and codex is a child
process as before. All four are still started before any is awaited.

You still want a spare pane of your own for the grill (stage 0 is the one stage
that talks to you) and for `npm run dev` — the conductor will not create those.

## Two rules that are load-bearing, not stylistic

**Prompts go through files; only one line is ever typed.** A stage's prompt is
written to `docs/runs/<slug>/prompts/<label>.txt` (gitignored, beside `logs/`) and
the pane is sent `Read <path> and do exactly what it says.` This is cheaper than
pasting kilobytes through a TTY, it matches the pipeline's paths-never-contents
rule, and it makes prompt content structurally incapable of reaching a shell — a
prompt full of `$(...)` is inert because no byte of it goes anywhere near one.

**No result is ever read back out of a pane.** `herdr agent read` returns
`agent_not_idle` while an agent is working, and Claude draws on the terminal's
*alternate screen*, so scrolled-off rows never enter herdr's scrollback and no
`--lines` value recovers them; even an idle read truncates. So: completion comes
from `agent wait`/`agent get`, results from the files the stage `produces`, and
numbers from transcripts. `agent read` is a diagnostic for a human looking at a
stuck pane, and the test suite fails if any code path calls it. Do not try to
scrape a pane — it is lossy in a way that only shows up on long stages.

## Gates hold the agent warm

In headless mode a gate meant the stage exited and `conduct answer` paid to boot
it again. In pane mode the agent is left **alive** and the stage is marked `held`:

- **decisions** — the stage wrote `DECISIONS.md`. Answer inline and run
  `conduct answer`; it nudges the same live agent in the same session. No boot,
  no `--resume`, no lost context.
- **blocked-ui** — herdr saw a permission or question dialog the agent is sitting
  on. Same hold, and the conductor tells you the workspace, pane and agent name so
  you can attach and answer it yourself.

Either way you get a desktop notification. A held reviewer does not stall the
other three; the review stage simply stays incomplete until it finishes.

## If it dies — reattach, restore, or start over

State is written to `run.json` **before** the prompt is sent, so a reboot can
never orphan a running stage invisibly. `conduct next` scans for `running` and
`held` stages before it looks for the next unstarted one, and does one of three
things:

- **reattach** — the agent is still there. Re-enter the watch loop on the same
  session. Nothing reboots. (This is also how a stage you answered by hand in its
  own pane gets its bookkeeping finished.)
- **restore** — the agent is gone but the session id is recorded: relaunch with
  `--resume <sid>` and re-hand the prompt path. Same session id before and after,
  so the numbers stay attributed.
- **re-run** — the session has nothing on disk to resume. It says so in plain
  words, pushes the dead id onto `previousSessions` (so its spend is still
  counted) and starts the stage over. Partial work is never presented as
  complete.

Two edges worth knowing. Restore needs `docs/runs/<slug>/prompts/<label>.txt`,
which is gitignored — a stage interrupted *before* that file was written cannot
be restored, and the conductor tells you so rather than guessing. And restore is
pane-only: with herdr down, `resume` exits and points you at
`conduct run <label>`.

`conduct plan` does **not** yet show a stage that is currently running. It is
display-only and no criterion asked for it; the pane itself is the live view.

## A full feature, start to finish

**1. Grill it** — in a pane of your own. `--autocompact` caps the window the
same way every conducted stage does; a long interactive grill with none would
grow toward the default and resend it every turn:

```bash
claude --autocompact 100000
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
stages and the mock gate. `start` also builds the cockpit — unless herdr is down,
or you pass `--no-panes`.

**3. Drive it:**

```bash
node scripts/pipeline/conduct.mjs next
```

One call now runs every stage the tier still owes, back to back, on its own —
no re-typing `next` after each clean one. It only stops for you at a real gate:

- **A decision.** A stage wrote `DECISIONS.md`. Answer inline — put `A: ...`
  under each question — then `conduct answer`. In pane mode the agent is still
  alive and just gets nudged; headless, it resumes warm via `--resume`.
- **The mock.** Open `docs/mocks/<slug>.html`. Not happy? Write what you want
  into `03-ux.md` and `conduct run ux`. Happy? `conduct next`.
- **Sign-off.** `08-accept.md` is a recommendation, not a decision.
- **A pane held on a dialog** (`blocked-launch` / `blocked-ui`) — attach and
  clear it, same as a single stage run.
- **A cycle-cap refusal.** Verify/fix has run its two verifies or three fixes;
  `next` stops and prints what is still open rather than spinning on a stage
  that keeps refusing to make progress.
- **A stage that genuinely fails** — a non-zero exit or a crash. `next` reports
  it and stops rather than pressing on past it. A stage that exits clean but
  did not write a file it was supposed to still only warns, as it always has -
  the warning is printed, and the next stage is attempted regardless.

An interrupted (`running`/`held`) stage is still picked up before anything new
starts, exactly as before — that reattach/restore/re-run dispatch is one call,
not chained into the next stage.

`--no-panes` is accepted by `start`, `next`, `run`, `answer` and `fix`, and is
**per-invocation** — it is never persisted, so it cannot silently turn pane mode
off for the rest of a run.

**4. Route any findings.** Reviewers report; only the developer fixes:

```bash
node scripts/pipeline/conduct.mjs fix "the finding, or the review file path"
node scripts/pipeline/conduct.mjs run verify
```

**5. See what it took** — tokens and time, per stage, plus the window figures:

```bash
node scripts/pipeline/conduct.mjs report
```

## If a stage goes wrong

- **Every stage ran headless when herdr was up.** Almost certainly hazard 2
  above: the launcher cannot pass native args, so each launch fails twice and
  falls back. The conductor prints herdr's error verbatim — read it rather than
  assuming.
- **A stage is `held` and you don't know why.** `holdReason` in `run.json` says
  `decisions` or `blocked-ui`; the second means go and look at the pane.
- **It didn't write what it promised.** The conductor says which file is missing.
  Just `conduct run <stage>` again — stages are re-runnable.
- **A build task failed.** `docs/runs/<slug>/logs/build-<task>.jsonl` is the full
  transcript. Fix the task's entry in `02-tasks.json` and re-run `build`;
  completed tasks are skipped via `tasksDone`.
- **Codex failed for infrastructure reasons** (network, quota, auth). That is not
  a clean review. Retry once, and if it fails again say the work is unreviewed —
  never present it as reviewed.
