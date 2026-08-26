# Feature: run the pipeline natively on herdr

## The ask

The feature pipeline currently runs stages as headless `claude -p` child
processes spawned by `scripts/pipeline/conduct.mjs`. They are invisible: nothing
appears in herdr's agent sidebar, you cannot watch a stage work, and you cannot
attach to one that is stuck.

Make the pipeline run **on herdr**. Each stage should be a named herdr agent in
its own pane — `architect`, `developer`, `tester` — showing in the sidebar with
live status (idle / working / blocked / done), attachable when it needs a human.

## Why it matters

The owner watched a senior architect work this way: agents listed down the left,
one pane showing the live diff, one showing the plan of what will change. Today
our pipeline gives none of that. A stage that runs 23 minutes (the ux stage did)
is a black box while it runs, and a stage that blocks on a question is invisible
until it times out.

## Must not regress

Token metering is the reason this pipeline exists. It must survive:

- per-stage **context tokens, output tokens and API-call count**
- these are recoverable from the session transcript, deduped by `requestId`
  (a single API response is written as one record per content block; naive
  summing overcounts ~2.6x). `scripts/pipeline/measure.mjs` already does this.
- `total_cost_usd` is NOT available from an interactive agent. Derive it from
  tokens x a per-model rate calibrated from a headless run, or drop the dollar
  column — but say which, do not silently show a wrong number.

## Defects to fix in the same change

1. **Stage totals never refresh.** `conduct report` shows cost but `context 0`
   and `0 calls` for every completed stage. Root cause already diagnosed: the
   conductor calls `sessionTotals()` the instant the stage process exits, before
   Claude Code has flushed that session's transcript to disk. It is a race, not
   a parsing bug. Each stage's own `logs/<stage>.jsonl` already contains the
   final `result` object, so the totals can be read from there instead — or the
   read can be retried/deferred. Fix it so `conduct report` and `conduct plan`
   show real numbers.

2. **Stages get no MCP servers.** There is no project `.mcp.json`, and a
   CLI-spawned session does not inherit the Claude Code desktop app's MCP
   servers. So the `mcp: true` flag on the ux and polish stages in the `STAGES`
   table is a no-op, and the ui-designer cannot drive a browser to check its own
   work. Either make it real or remove the flag; do not leave a knob that lies.

## Constraints

- Do not modify `.claude/agents/*.md`. The pipeline drives those definitions
  from outside; keeping them untouched is what makes rollback one `cp`.
- Herdr's CLI is the authority on its own syntax — `herdr agent`, `herdr pane`.
  A stage pane must be at a bare shell prompt before `herdr agent start`.
- The pipeline must still work when herdr is not running. Falling back to the
  current headless path is acceptable; failing is not.
- `conduct` remains the entry point. Whether panes are used should be a choice
  (a flag or config), not a hard dependency.

## Actors and needs

The owner, who is also the only operator. He needs to see what the pipeline is
doing while it does it, intervene in a stage that is stuck without killing the
run, and still get an honest per-stage token report at the end.

## Grill conclusions

Run 2026-08-26 with the owner. Every decision below is his, not the
orchestrator's. The earlier draft of this file waived the grill on the
orchestrator's judgement, which CLAUDE.md forbids; this replaces it.

**The reason this work exists is cost-effectiveness and speed.** Features are
getting too expensive; that is the problem being solved, and every criterion in
the spec must ladder back to it. Owner directive, stated twice, after the
orchestrator drifted into treating durability as the headline.

Herdr serves that goal in four specific ways, all of which are about waste:

1. **Destroyed runs are 100% waste.** A reboot killed a 44-minute run today and
   every token it had spent. Herdr's native session restore (`claude --resume
   <id>`) makes a run survive that. The integration is installed (v8).
2. **Parallel reviewers cut wall clock ~4x on that stage for zero extra tokens.**
3. **Steering a stuck stage costs less than killing and restarting it.** Today a
   blocked stage writes a file and exits, and resuming pays a full re-boot
   (~30k tokens). Holding it warm in a pane costs nothing.
4. **Seeing a stage go wrong early stops you paying for it to finish.** The ux
   stage ran 23 minutes and $7.31 unattended. Watching it is a cost control.

**What herdr does NOT fix, and must not be claimed to.** Per-stage token cost is
untouched by any of this. The largest levers are elsewhere and are tracked
separately, not in this feature:

- the **ux stage** is the most expensive in the pipeline ($7.31 / 1395s in the
  last real run, against design's $5.43 / 447s and spec's $0.70 / 143s)
- every stage pays a fixed **~26-33k boot**, so stage count is itself a cost
- **model tiering** per stage is configured but never yet tuned against measured
  cost

**Durability, not visibility, is the strongest single justification** — but it is
a means to the cost goal, not the goal.

**On visibility versus durability.** Watching panes is nice, but
it would not have earned this feature on its own. Herdr does native agent
session restore (`claude --resume <id>`) after a server stop or machine reboot —
and a reboot destroyed a 44-minute pipeline run today, wasting every token it had
spent. That is a token argument, which is the argument that started this work.
The `claude` integration is now installed (v8, above the v6 minimum). Observing,
steering and seeing the plan are real wants too, and come free with the same
mechanism.

**Decisions**

1. **Job to be done: all four** — see what is happening; steer or ask questions
   when something looks off; see the plan and who is working / idle / stuck; and
   survive restarts. (Q1: a+b+c+d)
2. **Budget ceilings are not the goal.** The owner is on a subscription; dollar
   figures are irrelevant. **Efficiency and speed** are what matter. Do not build
   dollar ceilings; do not print dollar figures as if they were the point. (Q2, Q4)
3. **Metering must become window-aware.** Report tokens burned in the current
   5-hour window, time until it resets, and a rolling 7-day total, across all
   sessions on the machine. `rate_limit_event` gives the window type and
   `resetsAt` but **no quota figure**, so never display a percentage-of-quota —
   it would be invented. Advisory only: warn before starting a stage if the
   window resets soon; never auto-halt a good run. (Q4, Q8)
4. **The two defects stay in scope**, not split out — they are bugs in a solution
   still being defined. (Q3)
5. **Parallel reviewers, sequential build tasks.** (Q6 = i) Reviewers are
   read-only and independent: same tokens, ~4x less wall clock, free. Parallel
   build tasks were considered and rejected *on token cost*: they lose the
   `04-build.md` handoff between tasks (so a later task rediscovers what an
   earlier one established — exactly the re-read cost this pipeline exists to
   kill), they need a merge, and a mis-sliced task is a wholly wasted run. The
   wall-clock prize is also small: in the last real run only t1/t2 were
   independent, so parallelism saves one task out of four. Revisit only for a
   feature sliced into many genuinely independent tasks.
6. **A workspace per run**, not panes in the owner's working tab. Panes are left
   open when a stage finishes so its reasoning can be scrolled back. Agents are
   named by **stage label** (`design`, `build-t1`, `review-security`) — herdr
   agent names must be unique, and the label already is. (Q7 = ii)
7. **Blocked stages hold, others continue.** When a stage blocks, hold it warm in
   its pane, notify, and let unrelated parallel work carry on. The owner answers
   in the pane. This replaces today's write-a-file-and-exit dance, which pays a
   full re-boot to resume. (Q9 = ii)
8. **Auto-detect herdr**, with an explicit `--no-panes` escape; headless when
   herdr is absent. Never hard-fail for want of herdr — unattended runs must
   still work. (Q10 = ii)
9. **Make `mcp: true` real** with a project `.mcp.json` containing a **browser
   server only**. Not Sanity: its tool definitions are large and would be paid
   for on every turn of every session in the repo, while almost no stage touches
   the catalogue. The concrete stake is that the ui-designer can currently only
   write CSS blind. (Q11)
10. **The conductor builds the whole cockpit**: plan pane, diff pane and stage
    panes, on `conduct start`. Not a recipe the owner assembles by hand each run.
    (Q12 = i)

**Actor:** the owner, who is also the only operator.

**Known technical risk, to be resolved in design, not by asking the owner:**
stage prompts are long and multi-line, and `herdr agent prompt` types text into a
TUI honouring bracketed paste. If it cannot carry ~2KB reliably (truncation, or a
newline submitting early), write the prompt to a file and prompt with only its
path — which is cheaper anyway, and matches this pipeline's existing rule that
stages are handed paths, never contents.
