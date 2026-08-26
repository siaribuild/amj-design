# Decisions — herdr-pipeline

Owner-only calls raised by the spec (`01-spec.md`). Answer inline: put `A: ...`
under each question, then `node scripts/pipeline/conduct.mjs answer`.

---

## 1. The cost column in pane mode

`total_cost_usd` comes from the headless `result` object and does not exist for
an interactive pane agent. Your brief says derive it or drop it, but say which.

- **(a) Derive and mark it.** Cost = deduped tokens × a per-model rate table,
  calibrated once from a headless run. Printed as `~$4.11` with a footnote
  naming the calibration. Unrated model → `unknown`.
- **(b) Drop the dollar column** in pane mode. Report tokens and calls only.
- **(c) Force headless for any stage you want a true dollar figure on.**

**Recommendation: (a).** Cost is how you notice a stage misbehaving, and losing
it would make pane mode a downgrade. The `~` and the footnote are what keep it
honest. It also gives decision 2 something to enforce against.

A:

---

## 2. The budget ceiling in pane mode

`--max-budget-usd` is likely headless-only, so pane mode may have no runaway
guard — the thing that stops a stage quietly spending 182M tokens.

- **(a) Conductor-side soft ceiling.** Poll the transcript; when estimated spend
  passes the stage's `budget`, print loudly, stop advancing the run, leave the
  pane alive for you to look at.
- **(b) Accept no ceiling in pane mode**, and say so once per run.
- **(c) Hard kill** the agent at the ceiling.
- **(d) Force headless** for stages with a budget (which is all of them).

**Recommendation: (a).** It preserves the guard without killing a session
mid-edit — and a stage you can see is a stage you can stop yourself. Depends on
decision 1(a) for the estimate; if you pick 1(b), this falls back to (b).

A:

---

## 3. Make `mcp: true` real, or delete it

The flag currently does nothing. Making it real means adding a project
`.mcp.json`, which is a new file in the repo and a per-turn token cost on the ux
and polish stages.

- **(a) Make it real with exactly one server — chrome-devtools.** The named pain
  is "the ui-designer cannot drive a browser to check its own work". Sanity is
  not needed by ux or polish.
- **(b) Make it real with chrome-devtools + Sanity.**
- **(c) Delete the flag** from `STAGES` and the docs; the ui-designer keeps
  working from screenshots you take.

**Recommendation: (a).** Smallest thing that stops the knob lying and fixes the
stated pain. (b) pays Sanity's tool definitions on every turn of a stage that
never queries the CMS.

A:

---

## 4. What the sidebar says

What you read down the left while a run is going.

- **(a) Stage label** — `spec`, `design`, `build-t1`, `review-security`. Unique
  by construction, already the log filename and the metering key.
- **(b) Role name** — `architect`, `developer`, `tester`, as your brief phrases
  it. Needs disambiguation where a role runs twice concurrently (the review
  stage runs an architect alongside two other Claude reviewers) and where one
  role runs many times in sequence (build tasks).
- **(c) Both** — `developer · build-t1`.

**Recommendation: (a)**, unless the role names are specifically what you want to
see. (c) is a one-line change if you want it and herdr allows the separator.

A:

---

## 5. Panes at the end of a run

- **(a) Leave every pane open**, agent exited, output readable.
- **(b) Close each stage's pane when it completes**, keeping the workspace small.
- **(c) Leave open on failure, close on success.**

**Recommendation: (a).** A finished stage's scrollback is often what you want to
look at ten minutes later, and pane reuse per role (spec assumption) already
bounds the count. You can close them yourself.

A:

---

## 6. Default for pane mode

- **(a) Off by default; `conduct panes on` per run.** Flip the default later once
  it has proven itself.
- **(b) On automatically whenever herdr is detected running.**
- **(c) On by default, `conduct panes off` to opt out.**

**Recommendation: (a) for this change, then (b) once you have run a few features
through it.** Auto-detection makes the first bad interaction happen on a real
feature rather than on a test run.

A:

---

## 7. The diff pane and the plan pane

You described the setup you saw as agents down the left, one pane showing the
live diff, one showing the plan. Building either is scope beyond "each stage is
a visible agent".

- **(a) Documented recipe only** — two lines in `PIPELINE-V2.md` for a
  `watch`-style loop on `conduct plan` and on `git diff`, in panes you open.
- **(b) A `conduct watch` command** that lays out the workspace for you and
  starts both loops.
- **(c) Neither.**

**Recommendation: (a).** It is a shell loop, not a feature, and the layout you
want will change as you use it. (b) is a small follow-up once (a) tells you what
layout you actually keep.

A:
