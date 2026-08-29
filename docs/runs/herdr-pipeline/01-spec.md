# Spec — run the pipeline natively on herdr

Run: `herdr-pipeline`. Source of truth for the ask and every decision below:
`docs/runs/herdr-pipeline/00-ask.md`.

**Grill (stage 0): run 2026-08-26 with the owner.** Its conclusions are binding.
An earlier draft of this spec was written against a version of `00-ask.md` that
waived the grill on the orchestrator's judgement; this replaces it. Where the
grill and this spec's earlier assumptions disagreed, the grill won.

**Sizing.** One feature, one pipeline run. Blast radius:
`scripts/pipeline/conduct.mjs`, `scripts/pipeline/measure.mjs`, one new test
suite, `docs/pipeline/PIPELINE-V2.md`, and one new project `.mcp.json`. No
wayfinder needed.

---

## 1. Problem, and the actor it serves

### The actor

Not a `CONTEXT.md` actor. This is developer tooling for the **owner acting as
pipeline operator** — the only operator there is. `CONTEXT.md` describes the
*product's* actors (Customer, Staff, Manufacturer partner, Visitor, …); nothing
here touches any of them, and **`CONTEXT.md` must not gain an actor for this**.
The pipeline operator is a role in the workshop, not in the domain.

### The problem — cost and speed

**Features are getting too expensive. That is the problem being solved.** Owner
directive, stated twice in the grill, the second time to correct a drift toward
treating visibility as the headline. Every acceptance criterion below must
ladder back to cost or speed; each group states how.

Four concrete wastes, all of which herdr addresses:

1. **A destroyed run is 100% waste.** A reboot killed a 44-minute run on the day
   of the grill and every token it had spent. Headless child processes die with
   their parent shell. Herdr panes survive, and its `claude` integration (v8,
   above the v6 minimum) does native session restore via `claude --resume <id>`.
   This is the strongest single justification — as a means to the cost goal, not
   as durability for its own sake.
2. **Steering a stuck stage costs less than killing and restarting it.** Today a
   blocked stage writes `DECISIONS.md` and exits; resuming pays a full re-boot
   (~30k tokens, and every stage pays a fixed ~26–33k boot). A stage held warm in
   a pane and answered in the pane costs nothing.
3. **Watching a stage is a cost control.** The ux stage ran 23 minutes and burned
   the most of any stage in the last real run, unattended. Seeing it go wrong at
   minute three stops you paying for it to finish.
4. **Parallel reviewers cut wall clock ~4× for zero extra tokens** — read-only,
   independent. That saving already exists in headless mode and must not be lost
   when stages move into panes.

Two defects sit in the same code and stay in scope (grill decision 4 — they are
bugs in a solution still being defined, not separable work):

5. **`conduct report` reports nothing.** It shows `context 0` and `0 calls` for
   every completed stage — so the metering that is the whole justification for
   pipeline v2 is blind. Root cause is a race: `sessionTotals()` is called the
   instant the stage process exits, before Claude Code has flushed that session's
   transcript to disk.
6. **`mcp: true` on the ux and polish stages is a no-op.** There is no project
   `.mcp.json` and a CLI-spawned session inherits nothing from the desktop app,
   so the ui-designer writes CSS blind and its work needs redoing — a wasted-run
   cost. A knob that lies is worse than no knob.

### The outcome

Runs survive restarts, stuck stages are steered warm instead of re-booted, bad
stages are visible early enough to kill, reviewers stay parallel — and the
metering that tells you whether any of it worked becomes window-aware and honest.

### Two findings from reading the code

- **`conduct.mjs:307` — already fixed on this branch.** The `fmt(ctx)`
  `ReferenceError` was a one-line typo and now reads `fmt(s.contextTokens)`.
  Recorded here so nobody re-fixes it. **The transcript-flush race underneath it
  is not fixed** and is defect 5 above.
- **`conduct start` never validates the slug.** `checkSlug` exists
  (`conduct.mjs:49`) but is only applied to the verify worktree path (line 520).
  `start` takes the slug straight into `join(RUNS, slug)` and a recursive
  `mkdirSync`. Under this change the slug also becomes part of herdr workspace,
  pane and agent identifiers, so it must be validated where it enters. Spec'd in
  criterion 37.

---

## 2. Acceptance criteria

Terminology: **pane mode** — stages run as herdr agents in panes of a
per-run workspace. **headless mode** — today's `claude -p` child processes.
**stage label** — the string the conductor already uses as the log filename and
`run.stages` key (`spec`, `design`, `build-t1`, `review-security`, `fix-0`).

### A. Durability — a destroyed run is 100% waste

*Ladders to cost: the run that died on reboot cost 44 minutes of tokens for zero output.*

1. **Given** a run in pane mode with a stage mid-work, **when** the machine
   reboots (or the terminal emulator is closed and reopened), **then** the stage's
   pane and its Claude session are restored by herdr, and `conduct` reports that
   stage as still in progress rather than as failed or not-started.

2. **Given** a run whose stage was interrupted and restored, **when** the operator
   runs `conduct next`, **then** the conductor **resumes** that stage's existing
   session rather than starting a new one — verifiable by `run.json` holding the
   same session id before and after, and by no second boot appearing in that
   session's transcript.

3. **Given** a stage whose session cannot be restored (herdr lost it, the session
   id is unknown), **when** `conduct next` runs, **then** the conductor says so
   explicitly and re-runs the stage from the start — it must never silently
   present a partially-completed stage as complete.

4. **Given** a restored run, **when** `conduct report` runs, **then** the tokens
   spent before the interruption are still counted for that stage — a restart
   must not lose the accounting along with the process.

### B. Steering warm, not re-booting

*Ladders to cost: today's blocked-stage dance pays a ~30k re-boot to resume; holding warm pays nothing.*

5. **Given** a stage in pane mode needs a human (a question, a permission prompt,
   an owner-only decision), **when** it blocks, **then** it **holds warm in its
   pane** — its process does not exit and no artifact-and-exit handshake is
   required — and herdr reports its lifecycle state as `blocked`.

6. **Given** a blocked stage, **when** it blocks, **then** the conductor notifies
   the operator with the workspace, pane and agent name to attach to, and
   **unrelated parallel work continues** — a blocked reviewer does not stall the
   other three.

7. **Given** a blocked stage held warm, **when** the operator answers it directly
   in the pane and the agent continues to completion, **then** the stage carries
   **exactly one session id** across the whole block-and-answer cycle and its
   transcript contains no second boot — the ~30k re-boot is not paid.

8. **Given** a stage that blocks in **headless** mode (herdr absent), **when** it
   blocks, **then** the existing `DECISIONS.md` gate and `conduct answer` path
   still work unchanged — pane mode adds a cheaper path, it does not remove the
   fallback one.

### C. Speed — parallel where it is free, sequential where it is not

*Ladders to speed and cost: reviewers are free wall-clock; parallel build tasks were rejected on token cost.*

9. **Given** the review stage in pane mode, **when** it runs its four reviewers,
   **then** they run concurrently and the stage's wall clock is **no more than
   half the sum** of the individual reviewer durations — moving reviewers into
   panes must not serialise them.

10. **Given** the review stage run in pane mode versus headless, **when** both are
    metered, **then** total reviewer context and output tokens are equivalent
    within measurement noise — the ~4× wall-clock saving costs no extra tokens.

11. **Given** the build stage, **when** it runs multiple tasks, **then** they run
    **strictly sequentially**, each handed the accumulated `04-build.md`, in both
    pane and headless mode. A test must fail if build tasks are made concurrent.
    (Rejected in the grill on token cost — see Out of scope.)

### D. Watching a stage is a cost control

*Ladders to cost: seeing a stage go wrong early stops you paying for it to finish.*

12. **Given** herdr is running, **when** the operator runs `conduct start <slug>`,
    **then** the conductor creates a **workspace for that run** — not panes in the
    operator's working tab — containing a plan pane and a diff pane, without the
    operator assembling anything by hand.

13. **Given** a run's workspace exists, **when** a stage starts, **then** a herdr
    agent of kind `claude` named by **stage label** exists in a pane of that
    workspace, and `herdr agent list` includes it before the conductor reports the
    stage as started.

14. **Given** a stage agent mid-work, **when** the operator runs
    `herdr agent read <label>`, **then** that stage's live output is returned and
    herdr reports its state as `working`.

15. **Given** a stage that finishes, **when** the conductor observes it, **then**
    completion is detected from herdr's reported state (not a fixed sleep), the
    pane is **left open** with its scrollback intact, and the same `produces`
    existence check as headless runs — a missing promised artifact still produces
    the `!! stage "<id>" did not write ...` warning.

16. **Given** a stage prompt of roughly 2KB containing newlines and quotes,
    **when** it is delivered to a pane agent, **then** the agent receives the
    prompt **complete and unmodified** — no truncation, and no newline submitting
    it early. (A test must assert the agent's received prompt matches the intended
    one exactly.)

### E. Metering — must not regress, and becomes window-aware

*Ladders to cost: metering is the instrument the cost goal is measured with. A blind instrument is why this defect matters.*

17. **Given** a stage completed in pane mode, **when** `conduct report` runs,
    **then** its row shows non-zero **context tokens**, **output tokens** and
    **API-call count** — no completed stage shows zero for all three.

18. **Given** a session whose transcript holds N assistant records over M distinct
    `requestId` values, **when** it is metered, **then** the API-call count is M
    and the context total is the requestId-deduped sum. The naive per-record sum
    (~2.6× overstated) must fail the test.

19. **Given** the same stage run once headless and once in pane mode, **when**
    both are metered, **then** both go through the same `measure.mjs` code path
    and neither mode has a metering field the other lacks.

20. **Given** two or more stages running concurrently in different panes, **when**
    both complete, **then** each stage's metering is attributed to its own session
    and no API call is counted under more than one stage.

21. **Given** a stage started in the tester's verify worktree, **when** it is
    metered, **then** its tokens are attributed to that stage and not lost.

22. **Given** any conductor output — `report`, `plan`, per-stage completion lines,
    warnings — **when** it is printed, **then** it contains **no dollar figure**.
    The owner is on a subscription; dollars are not the measure. A test must fail
    on a `$` in the conductor's numeric output.

23. **Given** `conduct report` runs, **when** it prints, **then** it shows, across
    **all Claude sessions on the machine** (not just this run): tokens burned in
    the current 5-hour window, the time until that window resets, and a rolling
    7-day total.

24. **Given** `rate_limit_event` supplies `rateLimitType` and `resetsAt` but **no
    quota figure**, **when** window metering is displayed, **then** it shows
    **no percentage of quota, no "remaining" figure, and no headroom estimate** —
    any such number would be invented. A test must fail if a percentage is
    rendered next to the window figures.

25. **Given** the 5-hour window resets within the advisory threshold, **when** the
    operator starts a stage, **then** the conductor prints an advisory naming the
    reset time **and starts the stage anyway**. It must never auto-halt, defer or
    refuse a run on window state.

### F. Defect 1 — stage totals never refresh

*Ladders to cost: same instrument. Today it reads zero.*

26. **Given** a stage exits before its transcript has flushed to disk, **when**
    the conductor meters it, **then** it still records real figures — by
    deferring/retrying the transcript read, or by reading the stage's own
    `logs/<label>.jsonl` result object — and `run.json` holds non-zero
    `contextTokens`, `outputTokens` and `turns`.

27. **Given** an existing `run.json` with a stage recorded as `contextTokens: 0`
    but carrying a session id, **when** `conduct report` or `conduct plan` runs
    later, **then** it recomputes from the transcript, shows the real numbers, and
    persists them so the recompute happens once.

28. **Given** a stage whose figures genuinely cannot be recovered (no session id,
    transcript absent), **when** `conduct report` runs, **then** that row shows
    `unknown`, not `0` — a zero must mean measured zero.

29. **Given** the metering fix, **when** the existing headless pipeline is run end
    to end, **then** `conduct report` and `conduct plan` show real per-stage
    numbers — the defect is fixed in **both** modes, not only in pane mode.

### G. Defect 2 — the MCP knob must not lie

*Ladders to cost: the ui-designer currently writes CSS blind, and blind work is redone work.*

30. **Given** a stage carrying `mcp: true`, **when** it runs, **then** a **browser
    MCP server** from a project `.mcp.json` is actually available to that session,
    evidenced by the session listing or calling it.

31. **Given** any stage **without** `mcp: true`, **when** it runs, **then** no MCP
    server definitions load into that session. Specifically, **Sanity's server is
    not in the project `.mcp.json`** — its tool definitions are large and would be
    paid for on every turn of every session in the repo while almost no stage
    touches the catalogue. A test must fail if a non-browser server appears.

32. **Given** the browser server is unavailable (not installed, fails to start),
    **when** the ux or polish stage runs, **then** the stage still runs and the
    conductor prints that the tool was unavailable — a missing browser degrades
    the stage, it does not abort the run.

### H. Herdr absent — never hard-fail

*Ladders to cost: a run that refuses to start, or aborts mid-way for want of a terminal manager, is a wholly wasted run.*

33. **Given** herdr is installed and running, **when** `conduct start` or
    `conduct next` runs with no flags, **then** pane mode engages
    **automatically** — no opt-in step.

34. **Given** `--no-panes` is passed, **when** the pipeline runs end to end,
    **then** its behaviour and artifacts are identical to today's headless path
    (the section F metering fixes excepted).

35. **Given** herdr is not installed or not running, **when** `conduct next`
    runs, **then** the stage runs headless, the conductor prints one line naming
    the reason, and the run completes normally. It must never hard-fail for want
    of herdr — unattended runs must still work.

36. **Given** a pane not at a bare interactive shell prompt, **when**
    `herdr agent start` fails (including `timeout waiting for agent startup`),
    **then** the conductor makes one bounded retry after re-checking readiness,
    and on a second failure falls back to headless for that stage, prints herdr's
    error verbatim, and continues the run — never aborting and never silently
    skipping the stage.

### I. Security

**Classification: no sensitive surface in the product sense.** This is developer
tooling: no customer data, no financial PII, no payout or bank details, no
authenticated endpoint. These criteria are **house-guardrail compliance** (input
validation at trust boundaries is never the lazy option), not cost criteria, and
they are stated rather than omitted deliberately.

Two real surfaces exist:

**I1 — command construction.** Pane mode builds herdr invocations from
run-derived strings (slug, stage label, cwd, prompt text). Today's code
deliberately avoids a shell — `execFileSync` with an argv array, the native
`claude` binary — so that "prompts containing quotes, backticks or newlines are
passed verbatim instead of being re-parsed by cmd.exe". That property must
survive.

37. **Given** a slug not matching `/^[a-z0-9][a-z0-9-]{0,48}$/`, **when**
    `conduct start <slug> "..."` is called, **then** it exits non-zero, creates no
    directory (including none outside `docs/runs/`), writes no `.active`, and runs
    no git or herdr command.

38. **Given** a stage prompt containing shell metacharacters — backticks,
    `$(...)`, `;`, newlines, double quotes — **when** it is delivered to a pane
    agent, **then** no part of it is executed by a shell. Test with a prompt
    containing a command substitution that would create a marker file; the marker
    must not exist.

39. **Given** any identifier the conductor passes to herdr — workspace name, pane
    id, agent name — **when** it is constructed, **then** it is composed only of
    characters from a validated allowlist; no unvalidated run or task field
    reaches a herdr command.

**I2 — transcript reading.** Metering reads `~/.claude/projects/**/*.jsonl`, and
now reads them **machine-wide** for the window figures (criterion 23). Those
transcripts contain everything every session read, which can include secrets a
session happened to open (`.dev.vars`, wrangler output, database rows).

40. **Given** the conductor meters any session, **when** it reads a transcript,
    **then** it extracts only usage/identity fields (`usage`, `requestId`,
    `sessionId`, `uuid`, `timestamp`, `cwd`, `model`, `isSidechain`,
    `rate_limit_event` fields) and writes **no message content** into `run.json`,
    `docs/runs/**`, or stdout.

41. **Given** window metering scans sessions belonging to other projects on the
    machine, **when** it aggregates them, **then** it reports **only counts** —
    never a session id, project path, file name or any content from another
    project.

42. **Given** metering is asked for a specific stage, **when** it runs, **then** it
    returns figures for a session id recorded by this run — it must not
    scan-and-guess by picking the newest transcript in the projects directory
    while concurrent sessions exist.

---

## 3. Out of scope

- **Dollar ceilings and dollar columns.** The owner is on a subscription;
  dollar figures are not the measure of anything here. No `--max-budget-usd`
  equivalent is built for pane mode, no cost is derived from a rate table, no
  cost column is printed. (Whether the *existing* headless `--max-budget-usd`
  runaway guard stays is decision 1.)

- **Parallel build tasks. Explicitly considered and rejected in the grill, on
  token cost — recorded here so nobody re-proposes it.** Concurrent build tasks
  lose the `04-build.md` handoff between tasks, so a later task rediscovers what
  an earlier one established — exactly the re-read cost this pipeline exists to
  eliminate. They also need a merge, and a mis-sliced task becomes a wholly
  wasted run instead of one the next task can correct. The wall-clock prize is
  small anyway: in the last real run only t1 and t2 were independent, so
  parallelism would have saved one task out of four. Revisit only for a feature
  sliced into many genuinely independent tasks.

- **Reducing per-stage token cost. Untouched by this feature, and the bigger
  levers live elsewhere — recorded with the numbers so they are not lost:**
  - the **ux stage** is the most expensive in the pipeline: **$7.31 / 1395s** in
    the last real run, against **design $5.43 / 447s** and **spec $0.70 / 143s**;
  - every stage pays a fixed **~26–33k boot**, so **stage count is itself a
    cost**;
  - **per-stage model tiering** is configured in `STAGES` but has never been
    tuned against measured cost.

  (Dollar figures appear here because they are the historical measurements the
  grill cited. They are not a thing this feature displays — criterion 22.)

- **Any change to `.claude/agents/*.md`.** Hard constraint; rollback stays one
  `cp`, and `docs/pipeline/v1-backup/RESTORE.md` must still describe a working
  one-`cp` rollback when this lands.

- **Changing the stage list, their order, their prompts, the three gates, or the
  `compact` values.** This feature changes *where a stage runs*, *how it is
  steered* and *how it is measured* — not what it does.

- **A TUI or custom dashboard renderer.** The conductor builds the cockpit out of
  herdr panes running existing commands (`conduct plan`, `git diff`). No new
  rendering layer.

- **Putting the grill (stage 0) under the conductor.** It is the one stage that
  talks to the user; it stays manual.

- **Running the Codex reviewer as a pane agent.** Not a Claude CLI agent; it
  stays a child process.

- **Making herdr a dependency of the repo** — no install step, no version pin in
  `package.json`.

- **Cross-machine or remote panes, multi-operator use, CI integration.**

---

## 4. Assumptions

Each is the owner's to veto. Points settled by the grill are **not** listed here —
they are decisions, not assumptions.

- `ASSUMED:` The metering source of truth stays the transcript with `requestId`
  dedup in `measure.mjs`. Defect 1, pane-mode metering and the window figures are
  all served by extending that one path rather than adding a second accounting
  mechanism.
- `ASSUMED:` **Window boundary when no `rate_limit_event` has been seen.** With
  no event, the conductor cannot know when the current window started, so it
  reports a **trailing 5 hours** and labels it as such — visibly distinct from a
  figure anchored to a real `resetsAt`. It never presents a trailing window as
  the provider's window.
- `ASSUMED:` The advisory threshold for "resets soon" (criterion 25) is **15
  minutes**, a constant near the `STAGES` table.
- `ASSUMED:` **One pane per agent role**, reused across that role's stages, plus
  transient panes for the parallel reviewers — bounding pane count to roughly
  five plus reviewers rather than one per stage per build task. Reuse returns the
  pane to a bare shell prompt and starts a **new** Claude session; the same agent
  is never re-prompted across stages, which would accumulate context and corrupt
  per-stage metering. (Distinct from criterion 7, where one *stage* is held warm
  across a block.)
- `ASSUMED:` A pane agent runs with the same permission posture as today —
  `bypassPermissions` for working stages, plan mode for reviewers — so pane mode
  does not introduce a stream of prompts. A stage that blocks anyway is
  criterion 5.
- `ASSUMED:` Panes are created **without stealing focus**, so starting a stage
  never moves the operator out of the pane they are reading.
- `ASSUMED:` "API-call count" means distinct `requestId`s (what `measure.mjs`
  counts as `turns`), not `num_turns` from the result object. These differ; the
  deduped count is the one the brief describes.
- `ASSUMED:` The existing `compact` context cap is applied identically in pane
  mode. If an interactive session cannot take it, that is a design finding to
  raise — not something to drop silently, since it is the pipeline's largest
  measured lever.
- `ASSUMED:` Verification is by a new node:test suite under `scripts/tests/`
  (wired to a `test:*` script) with the herdr CLI stubbed, **plus** a live
  end-to-end run of one real stage in a pane and one real interrupt-and-resume,
  recorded as evidence. Herdr itself is not this repo's code and is not unit
  tested.
- `ASSUMED:` No Playwright coverage is required — no browser UI is added.
  `conduct ui` stays **off** for this run and the mock gate does not apply.

### Unknowns the architect must resolve by running the tools, not by recall

The brief is explicit that the installed binaries are the authority.

1. `herdr --skill` — exact syntax and JSON of `workspace`/`pane split`/
   `pane run`/`agent start`/`agent prompt --wait`/`agent read`/
   `agent wait --until`/`agent list`; how a pane id is obtained; how "finished"
   is distinguished from "blocked"; and exactly what its `claude` integration v8
   restores after a reboot (criterion 1).
2. **The 2KB prompt risk, named in the grill.** `herdr agent prompt` types into a
   TUI honouring bracketed paste. If it cannot carry a long multi-line prompt
   reliably, write the prompt to a file and prompt with only its path — cheaper
   anyway, and it matches this pipeline's existing rule that stages are handed
   paths, never contents. Criterion 16 must pass either way.
3. `claude --help` — whether an interactive session accepts `--session-id`
   (which would make attribution exact by construction and make restore
   deterministic), `--autocompact`, `--mcp-config` / `--strict-mcp-config`, and
   `--permission-mode`.
4. The shape and reliability of `rate_limit_event` in the stream and in
   transcripts: which fields are present, how often it is emitted, and whether it
   appears at all in a session that never approaches a limit (criterion 23's
   fallback depends on this).
5. Whether the pane-readiness failure in the brief's empirical note is timing (a
   settle/wait fixes it) or state (the pane needs an explicit return to a bare
   prompt). Criterion 36 requires a real error path either way.

---

## 5. Decisions outstanding

Two new owner-only calls are in `docs/runs/herdr-pipeline/DECISIONS.md`. Both are
small and neither blocks design from starting; decision 1 affects Out of scope
and decision 2 affects criterion 12.
