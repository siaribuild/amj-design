> **STALE — WRITTEN BEFORE THE GRILL. DO NOT BUILD FROM THIS.**
>
> This spec was written against a brief whose "Grill conclusions" section read
> "not run". That was the orchestrator waiving stage 0 on its own judgement,
> which CLAUDE.md forbids. The grill has since been run with the owner and
> several decisions here are directly overruled — see
> `docs/runs/herdr-pipeline/00-ask.md`.
>
> Known contradictions, pending revision:
>
> - **Criterion 26 and decision 2 spec a dollar column and a budget ceiling.**
>   Both are deleted. The owner is on a subscription; dollar figures are
>   irrelevant. Metering becomes window-aware instead (5-hour window usage,
>   reset time, rolling 7-day total) and must never display a
>   percentage-of-quota, which is not reported and would be invented.
> - **The framing is wrong.** This feature exists for cost-effectiveness and
>   speed. Not visibility, not durability.
> - **Parallel build tasks** must be spec'd as explicitly rejected, on token
>   cost.
>
> A revision is in flight with the product-manager. Until it lands, `00-ask.md`
> is authoritative wherever the two disagree.

# Spec — run the pipeline natively on herdr

Run: `herdr-pipeline`. Source of truth for the ask: `docs/runs/herdr-pipeline/00-ask.md`.

**Grill (stage 0): not run.** The owner asked for this directly and stated the
shape is not in question. The actors-and-needs section below is therefore taken
verbatim from `00-ask.md`, not from a grill transcript, and is not extended with
anything unevidenced.

**Sizing.** One feature, one session's pipeline run. The blast radius is
`scripts/pipeline/conduct.mjs`, `scripts/pipeline/measure.mjs`, a new test suite,
one docs file and possibly one new `.mcp.json`. No wayfinder needed.

---

## 1. Problem, and the actor it serves

### The actor

Not a `CONTEXT.md` actor. This is developer tooling for the **owner acting as
pipeline operator** — the only operator there is. `CONTEXT.md` describes the
*product's* actors (Customer, Staff, Manufacturer partner, Visitor, …); nothing
in this feature touches any of them, and **`CONTEXT.md` must not gain an actor
for it**. The pipeline operator is a role in the workshop, not in the domain.

His need, in his own terms (`00-ask.md`, verbatim):

> The owner, who is also the only operator. He needs to see what the pipeline is
> doing while it does it, intervene in a stage that is stuck without killing the
> run, and still get an honest per-stage token report at the end.

### The problem

Stages run as headless `claude -p` child processes spawned by
`scripts/pipeline/conduct.mjs`. Three consequences:

1. **A running stage is a black box.** The ux stage ran 23 minutes. Its tool
   calls scroll past in the conductor pane and are then gone; nothing appears in
   herdr's agent sidebar; there is no way to look at what it is doing now.
2. **A stuck stage is invisible until it times out.** A stage that wants a human
   cannot get one. The only channel is the file-based decision gate, which the
   stage must choose to use.
3. **You cannot intervene without killing the run.** The only lever on a headless
   child is killing it, which loses the stage.

And two defects sit alongside, in the same code:

4. **`conduct report` lies about tokens.** It shows a cost but `context 0` and
   `0 calls` for every completed stage — so the metering that is the entire
   justification for pipeline v2 currently reports nothing.
5. **`mcp: true` on the ux and polish stages is a no-op.** There is no project
   `.mcp.json` and a CLI-spawned session inherits nothing from the desktop app,
   so the ui-designer cannot drive a browser to check its own work. The knob in
   the `STAGES` table lies.

### The outcome

Each stage runs as a named herdr agent in its own pane, visible in the sidebar
with live status, attachable when it needs a human — while the per-stage
context / output / API-call metering stays honest, and the pipeline still runs
when herdr does not.

### Two defects found while speccing (fold into the same change)

Both are in `scripts/pipeline/conduct.mjs` and both are load-bearing on defect 4:

- **Line 307 references an undefined variable.** In the stage-completion print:

  ```js
  process.stdout.write('  ok ' + label + '  $' + s.cost.toFixed(2) +
    '  ctx ' + fmt(ctx) + '  out ' + fmt(s.outputTokens) + '  ' + s.seconds + 's\n')
  ```

  `ctx` does not exist in that scope (`s.contextTokens` does). This throws a
  `ReferenceError` inside the `close` handler, where the top-level `.catch` at
  line 653 cannot see it. `run.stages[label]` is saved just above, which is why
  the run survives with a cost recorded and zeros beside it.

- **`conduct start` does not validate the slug.** `checkSlug` exists (line 49)
  but is only called on the verify worktree path (line 520). `start` takes the
  slug straight into `join(RUNS, slug)` and `mkdirSync(..., {recursive:true})`.
  Under this change the slug also becomes part of herdr agent/pane identifiers,
  so it must be validated where it enters, not where it is eventually used.

---

## 2. Acceptance criteria

Terminology used below:

- **pane mode** — stages run as herdr agents in panes.
- **headless mode** — today's behaviour: `claude -p` child processes.
- **stage label** — the string the conductor already uses as the log filename and
  the `run.stages` key (`spec`, `design`, `build-t1`, `review-security`, `fix-0`).

### A. Visible agents (the core outcome)

1. **Given** herdr is running and pane mode is enabled for the run, **when** the
   operator runs `conduct next`, **then** a herdr agent of kind `claude` exists,
   named for that stage, in its own pane, and `herdr agent list` (JSON) includes
   it before the conductor reports the stage as started.

2. **Given** a stage agent is mid-work in pane mode, **when** the operator runs
   `herdr agent read <name>`, **then** the agent's live output for that stage is
   returned, and herdr reports its lifecycle state as `working`.

3. **Given** a stage agent that has finished its prompt, **when** the conductor
   observes it, **then** the conductor detects completion from herdr's reported
   state (not from a fixed sleep), records the stage in `run.json`, and runs the
   same `produces` existence check it runs in headless mode — a missing promised
   artifact produces the same `!! stage "<id>" did not write ...` warning.

4. **Given** a stage agent stops needing human input (a permission prompt, a
   question, an unanswered decision), **when** herdr reports it as `blocked`,
   **then** the conductor prints the agent name and pane id to attach to, does
   not advance to the next stage, and does not hang indefinitely.

5. **Given** a stage is blocked and the operator attaches to its pane and answers
   it directly, **when** the agent resumes and finishes, **then** the conductor
   records that stage as complete with full metering — intervening does not kill
   or invalidate the run.

6. **Given** a run in pane mode has already run one stage for a given agent
   role, **when** a later stage uses the same role, **then** it starts a **new**
   Claude session (no context inherited from the earlier stage), verifiable by
   the two stages having different session ids in `run.json`.

7. **Given** the review stage fans out four reviewers in parallel in pane mode,
   **when** it runs, **then** each Claude reviewer has its own uniquely named
   herdr agent and pane, and the Codex reviewer continues to run exactly as today
   (a child process, not a pane agent).

8. **Given** the constraint that agent definitions are untouched, **when** the
   feature is complete, **then** `git diff` shows no change to any file under
   `.claude/agents/`, and `docs/pipeline/v1-backup/RESTORE.md` still describes a
   working one-`cp` rollback.

### B. Metering must not regress

9. **Given** a stage completed in pane mode, **when** `conduct report` runs,
   **then** that stage's row shows non-zero **context tokens**, **output tokens**
   and **API-call count** — no row for a completed stage shows `0` for all three.

10. **Given** a session whose transcript contains N assistant records over M
    distinct `requestId` values, **when** the conductor meters that session,
    **then** the reported API-call count is M and the context total is the
    requestId-deduped sum — the naive per-record sum (~2.6× overstated) must fail
    the test.

11. **Given** the same stage prompt run once headless and once in pane mode,
    **when** both are metered, **then** both report context, output and call
    count by the same code path in `measure.mjs`, and neither mode has a metering
    field the other lacks.

12. **Given** two or more stages running concurrently in different panes,
    **when** both complete, **then** each stage's metering is attributed to its
    own session and no API call is counted under more than one stage.

13. **Given** a stage started in a non-default working directory (the tester's
    verify worktree), **when** it is metered, **then** its tokens are attributed
    to that stage and not lost or attributed to another run.

14. **Given** pane mode, **when** a stage session is started, **then** it is
    started with the same context cap (`compact`) as headless mode; **or**, if
    that is not possible for an interactive session, the conductor prints one
    explicit line per run saying the cap is not applied and what that costs.
    Silently dropping lever 1 fails this criterion.

### C. Defect 1 — stage totals never refresh

15. **Given** any stage completes, **when** the conductor prints its `ok` line,
    **then** it prints the stage's real context/output/turn figures and the
    process does not throw — specifically, the `fmt(ctx)` `ReferenceError` at
    `conduct.mjs:307` is gone and a regression test fails if an undefined
    identifier is reintroduced on that path.

16. **Given** a stage that has just exited before its transcript has been flushed
    to disk, **when** the conductor meters it, **then** it still records real
    figures — by deferring/retrying the transcript read, or by reading the
    stage's own `logs/<label>.jsonl` result object — and `run.json` holds
    non-zero `contextTokens`, `outputTokens` and `turns` for that stage.

17. **Given** an existing `run.json` with a stage recorded as `contextTokens: 0`
    but carrying a session id, **when** `conduct report` or `conduct plan` runs
    later, **then** it recomputes that stage's figures from the transcript,
    displays the real numbers, and persists them back so the recompute happens
    once.

18. **Given** a stage whose figures genuinely cannot be recovered (no session id
    recorded, transcript absent), **when** `conduct report` runs, **then** that
    row shows `unknown`, not `0` — a zero must mean measured zero.

### D. Defect 2 — the MCP knob must not lie

19. **Given** a stage carrying `mcp: true` in `STAGES`, **when** it runs,
    **then** the MCP server(s) that flag promises are actually available to that
    session, evidenced by the session listing or calling them; **or** the flag no
    longer exists anywhere in `STAGES`, `PIPELINE-V2.md` or `CLAUDE.md`. A flag
    that is present and has no effect fails this criterion.

20. **Given** a stage without `mcp: true`, **when** it runs, **then** no MCP
    server definitions are loaded into that session — the per-turn token cost of
    the non-UI stages is unchanged by this feature.

21. **Given** the MCP server configured for the UI stages is unavailable
    (not installed, fails to start), **when** the ux or polish stage runs,
    **then** the stage still runs and the conductor prints that the tool was
    unavailable — a missing browser tool degrades the stage, it does not abort
    the run.

### E. Herdr not running — fallback

22. **Given** herdr is not installed or not running, **when** `conduct next` is
    called with pane mode enabled, **then** the stage runs headless exactly as it
    does today, the conductor prints one line naming the reason, and the run
    completes normally.

23. **Given** a pane that is not at a bare interactive shell prompt, **when** the
    conductor attempts `herdr agent start` and gets `timeout waiting for agent
    startup` (or any start failure), **then** it makes one bounded retry after
    re-checking readiness, and on a second failure falls back to headless for
    that stage, prints the herdr error verbatim, and continues the run. The run
    must not abort and must not silently skip the stage.

24. **Given** a stage that started in a pane but whose pane is closed or killed
    mid-stage, **when** the conductor notices, **then** it reports that stage as
    failed with the pane name, records whatever metering is recoverable, and
    stops — it must not report a killed stage as complete.

25. **Given** pane mode is not enabled, **when** the pipeline runs end to end,
    **then** its behaviour, output and artifacts are identical to today's
    headless path (defect fixes in section C excepted).

### F. Do not show a number you cannot compute

26. **Given** a stage run in pane mode, where `total_cost_usd` is not available,
    **when** `conduct report` or `conduct plan` prints its cost, **then** that
    figure is either (a) explicitly marked as derived/estimated with the
    derivation named, or (b) absent — and in neither case is an unmarked dollar
    figure shown next to a paned stage.

27. **Given** a stage whose cost is unknown, **when** it is printed, **then** it
    renders as `unknown` / `—`, never as `$0.00`. `$0.00` must mean measured zero
    (as it correctly does for the Codex reviewer, which spends no Claude tokens).

28. **Given** a run mixing headless and paned stages, **when** `conduct report`
    prints the TOTAL row, **then** the total distinguishes measured from
    estimated spend rather than summing them into one unqualified number.

29. **Given** a session that used a model with no entry in whatever rate table
    the cost derivation uses, **when** its cost is printed, **then** it is
    `unknown` — the conductor must not fall back to another model's rate.

### G. Security

**Classification: no sensitive surface in the product sense** — this is developer
tooling, it holds no customer data, no financial PII, no payout or bank details,
and touches no authenticated endpoint. Two real surfaces exist anyway and get
negative criteria:

**G1 — command construction.** Pane mode builds herdr invocations and shell
commands from run-derived strings (slug, stage label, cwd, prompt text). Today's
code deliberately avoids a shell (`execFileSync` with an argv array, native
`claude` binary, "prompts containing quotes, backticks or newlines are passed
verbatim instead of being re-parsed by cmd.exe"). That property must survive.

30. **Given** a slug that does not match `/^[a-z0-9][a-z0-9-]{0,48}$/`, **when**
    `conduct start <slug> "..."` is called, **then** it exits non-zero, creates no
    directory (including no path outside `docs/runs/`), writes no `.active`, and
    runs no git or herdr command.

31. **Given** a stage prompt containing shell metacharacters — backticks,
    `$(...)`, `;`, newlines, double quotes — **when** it is delivered to a pane
    agent, **then** the agent receives the prompt text verbatim and no part of it
    is executed by a shell. Test with a prompt containing a command substitution
    that would create a marker file; the marker must not exist.

32. **Given** any identifier the conductor passes to herdr (agent name, pane id,
    workspace name), **when** it is constructed, **then** it is composed only of
    characters from a validated allowlist — no unvalidated run or task field
    reaches a herdr command.

**G2 — transcript reading.** Metering reads `~/.claude/projects/**/*.jsonl`.
Those transcripts contain everything a stage read, which can include secrets a
stage happened to open (`.dev.vars`, `wrangler` output, database rows).

33. **Given** the conductor meters a session, **when** it reads a transcript,
    **then** it extracts only usage/identity fields (`usage`, `requestId`,
    `sessionId`, `uuid`, `timestamp`, `cwd`, `model`, `isSidechain`) and writes
    no message content into `run.json`, `docs/runs/**`, or stdout.

34. **Given** metering is asked for a session that does not belong to this run,
    **when** it runs, **then** it returns that session's figures only if the
    session id was recorded by this run — the conductor must not scan-and-guess
    by picking the newest transcript in the projects directory when concurrent
    sessions exist.

---

## 3. Out of scope

- **Any change to `.claude/agents/*.md`.** Hard constraint; rollback stays one `cp`.
- **Changing the stage list, their order, their prompts, the three gates, or the
  budget/compact values.** This feature changes *where a stage runs* and *how it
  is measured*, not what it does.
- **A TUI or dashboard.** No custom renderer, no live-updating status screen.
  Herdr's own sidebar is the UI; `conduct plan` is the text view. The "live diff"
  and "the plan" panes the owner saw are the operator's own panes — at most a
  documented one-line recipe (see decision 7).
- **Putting the grill (stage 0) under the conductor.** It is the one stage that
  talks to the user and it stays manual.
- **Running the Codex reviewer as a pane agent.** It is not a Claude CLI agent;
  it stays a child process.
- **Auto-killing a runaway stage** (see decision 2 — the recommendation is warn
  and stop advancing, not kill).
- **Reducing pipeline token spend.** This feature must not *regress* metering or
  the context cap; making the pipeline cheaper is a separate effort.
- **Cross-machine / remote panes, multi-operator use, CI integration.**
- **Making herdr a dependency of the repo** — no install step, no version pin in
  `package.json`; the pipeline must work on a machine without it.

---

## 4. Assumptions

Each is the owner's to veto.

- `ASSUMED:` Pane mode is **opt-in and persisted per run** — a `conduct panes on`
  command mirroring `conduct ui on`, stored in `run.json`. Default off for this
  change (see decision 6).
- `ASSUMED:` The herdr agent name is the **stage label** the conductor already
  uses (`spec`, `design`, `build-t1`, `review-security`) — unique by
  construction, and already the log filename and metering key (see decision 4).
- `ASSUMED:` **One pane per agent role**, reused across that role's stages, plus
  transient panes for the parallel reviewers. This bounds pane count to roughly
  five plus reviewers rather than one per stage per task. Reuse means the pane is
  returned to a bare shell prompt and a **new** Claude session is started
  (criterion 6) — never the same agent re-prompted, which would accumulate
  context across stages and corrupt per-stage metering.
- `ASSUMED:` The metering source of truth stays the transcript with `requestId`
  dedup, in `measure.mjs`. Both defect 1 and pane-mode metering are fixed through
  that one path rather than by adding a second accounting mechanism.
- `ASSUMED:` A pane agent runs with the same permission posture as today
  (`bypassPermissions` for working stages, plan mode for reviewers), so pane mode
  does not introduce a stream of permission prompts. A stage that blocks anyway
  is handled by criterion 4.
- `ASSUMED:` Panes are created **without stealing focus** (`--no-focus`), so
  starting a stage never moves the operator out of the pane they are reading.
- `ASSUMED:` The conductor creates panes in the **current herdr workspace** and
  does not create or switch workspaces.
- `ASSUMED:` "API-call count" in the report means distinct `requestId`s (what
  `measure.mjs` counts as `turns`), not `num_turns` from the result object. These
  differ; the deduped count is the one the owner's brief describes.
- `ASSUMED:` Verification of this feature is by node:test against the conductor's
  own logic (new suite under `scripts/tests/`, wired to a `test:*` script) plus a
  live end-to-end run of one real stage in a pane, recorded as evidence. The
  herdr CLI itself is stubbed in the unit tests; it is not this repo's code.
- `ASSUMED:` No Playwright coverage is required — this feature adds no browser UI.
  `conduct ui` stays **off** for this run and the mock gate does not apply.

### Notes the architect must resolve before designing (not assumptions — unknowns)

The brief is explicit that the installed binaries are the authority. The design
must verify, by running them, not by recalling:

1. `herdr --skill` — exact syntax and JSON shape of `pane split`, `pane run`,
   `agent start`, `agent prompt --wait`, `agent read`, `agent wait --until`,
   `agent list`; and how a pane id is obtained and how "the agent finished" is
   distinguished from "the agent is blocked".
2. `claude --help` — whether an interactive session accepts `--session-id`
   (which would make metering attribution exact by construction and make the
   decision gate's `--resume` work unchanged), `--autocompact` (criterion 14),
   `--max-budget-usd` (decision 2), `--mcp-config` / `--strict-mcp-config`
   (criteria 19–20) and `--permission-mode`.
3. Whether the pane-readiness failure in the brief's empirical note is a timing
   issue (a settle/wait fixes it) or a state issue (the pane needs an explicit
   return to a bare prompt). Criterion 23 requires a real error path either way.

---

## 5. Decisions outstanding

Seven owner-only calls are in `docs/runs/herdr-pipeline/DECISIONS.md`, each with
a recommendation. The cost-column question (decision 1) and the budget-ceiling
question (decision 2) change acceptance criteria 26–29 and 14 respectively, so
they should be answered before design.
