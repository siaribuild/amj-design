# Decisions — herdr-pipeline

The grill of 2026-08-26 resolved the seven questions raised by the first draft of
this file. Those are now recorded in `00-ask.md` and are not re-opened here.

Two **new** owner-only calls arise from the grill's answers. Answer inline: put
`A: ...` under each, then `node scripts/pipeline/conduct.mjs answer`.

---

## 1. The existing `--max-budget-usd` runaway guard — keep it or delete it?

The grill settled that dollars are not the measure and no dollar ceiling is to be
built. That resolves the *new* pane-mode question by deletion. It leaves an
existing one: `STAGES` already carries a `budget` per stage, passed to headless
sessions as `--max-budget-usd`, described in the code as "a RUNAWAY GUARD, set
well above expected spend, not a target".

It is not a spend control — on a subscription the figure is notional — but it is
the only mechanism that currently stops a stage that has gone into a loop.

- **(a) Keep it in headless mode as a runaway guard**, stop calling it a budget,
  and print no dollars anywhere (criterion 22). Pane mode gets no equivalent, per
  the grill's "never auto-halt".
- **(b) Delete `budget` entirely** and rely on watching the pane, which is what
  the feature is for.
- **(c) Replace it with a token ceiling** per stage, so the guard survives in the
  unit that actually matters.

**Recommendation: (a).** Smallest diff, and it keeps a guard on the unattended
headless path, which is exactly the path nobody is watching. (c) is a real
improvement but it is new machinery in a feature whose out-of-scope section
already says per-stage cost work lives elsewhere.

A:

---

## 2. Stage panes — created up front, or as each stage starts?

The grill settled that the conductor builds the whole cockpit on `conduct start`:
plan pane, diff pane and stage panes, in a workspace per run. What "stage panes"
means at `start` time is still open, and it changes what you see.

- **(a) Skeleton at start, stage panes on demand.** `conduct start` creates the
  workspace, plan pane and diff pane; each stage's pane appears in that workspace
  when the stage begins. The sidebar grows as the run progresses.
- **(b) All stage panes up front, empty.** The full run is visible as a row of
  idle agents from the first second, filling in as stages execute. Includes panes
  for stages that may never run (`ux`/`polish` on a non-UI feature).
- **(c) All stage panes up front, minus the ones this run will skip.**

**Recommendation: (a).** A pane with nothing in it is noise, and `conduct plan`
in the plan pane already shows the whole run's shape including what has not
started. (b) is the closest to the "agents listed down the left" picture that
prompted this feature, so say so if that is what you want to see.

A:

---

## Owner answers (2026-08-26, round 2)

**D1 — runaway guard: KEEP, but unify it with blocked-and-hold.**

The owner's question — "we had a concept earlier that 3 retries max and then
ask, is this the same conceptually?" — is the better framing, and supersedes the
recommendation that prompted it.

There is ONE concept, *runaway detected*, and the response depends on whether a
human is present:

- **pane mode** — hold the stage warm in its pane, notify, and ask. This is the
  Q9 blocked-and-hold path that criteria 5-8 already specify; a runaway simply
  becomes another thing that can enter it. No new mechanism.
- **headless** — stop, record the reason, leave committed work in place. There
  is nobody to ask, which is the only reason a hard stop exists at all.

This matches the guardrails already in the repo: `agent-guard` pauses for
explicit approval and tells the operator to *diagnose, not re-approve*; the
Codex rule is retry once, then stop and say so plainly. Both ask when a human is
there. `--max-budget-usd` hard-stops only because headless cannot ask.

Consequences for the design:

- Do NOT build a separate budget-guard mechanism. Extend the blocked-and-hold
  path with a runaway trigger.
- The threshold is expressed in **tokens or turns, never dollars** — consistent
  with deleting the cost column. `--max-budget-usd` may remain as the underlying
  headless enforcement primitive if nothing better exists, but it is an
  implementation detail, is not called a budget, and never surfaces a dollar
  figure.
- A stage held for runaway must be resumable warm, like any other held stage -
  no re-boot to continue.

**D2 — pane timing: skeleton first, stage panes on demand.**

Workspace, plan pane and diff pane at `conduct start`; each stage pane appears
when that stage begins. Lighter on a 16GB machine, and no panes for stages that
never run (the ui stages when `ui` is off).

---

## Architect's decisions raised (2026-08-26, design stage)

Answer inline with `A:` as before. Neither blocks the build starting — the stub
test suite and the headless fallback are unaffected. Decision 3 gates only the
**live** pane-mode evidence.

## 3. Pane mode cannot launch claude on this machine today — pick the remediation

Probed live during design (evidence in `02-design.md` §1): herdr panes currently
run with a restricted filesystem view. Files under `%APPDATA%` that existed
before the herdr server started are invisible inside panes (`Test-Path
...\Roaming\npm` → False from a pane; True outside), while `E:\Projects`,
`~/.claude` and Program Files are visible. Your only claude install is the npm
global under `%APPDATA%\npm` — so no pane can start claude, and `herdr agent
start --kind claude` times out ("timed out waiting for agent startup",
reproduced twice on a fresh workspace). Same host, same user, medium integrity,
not AppContainer; the cause was not identified — you may know it (a sandboxing
tool? how the server was started?).

The conductor is designed to survive this (probe → verbatim diagnosis →
headless fallback, criteria 35/36), but pane mode stays dark until claude is
launchable from a pane:

- **(a) Install Claude Code's native build** (`irm https://claude.ai/install.ps1 | iex`),
  which lands at `%USERPROFILE%\.local\bin\claude.exe` — the profile root IS
  visible from panes. The conductor's binary resolution already prefers this
  path when it exists. Adds a second claude install alongside the npm one.
- **(b) Restart the herdr server from a fresh shell** (`herdr session stop
  default`, then `herdr`) and re-probe — if the restricted view is an artifact
  of how the current server was started, this alone fixes it. Costs your
  current panes.
- **(c) Accept headless-until-fixed** — the run works, pane mode waits.

**Recommendation: (b) first (free, diagnostic), then (a) if the view is still
restricted.** Re-probe with:
`herdr workspace create --cwd E:\Projects\amj-website-design --label probe --no-focus`,
then `herdr pane run <root-pane> "Test-Path $env:APPDATA\npm"` and read the
pane. `True` means pane mode will light up with zero code change.

A:

## 4. Reviewers in the sidebar: 2 of 4, not 4 of 4

Your grill answer (Q7) used `review-security` as an example agent name. The
design puts **conformance and ponytail** in panes, but keeps **security** as a
headless `-p "/security-review"` child in all modes: `security-review` is
compiled into the CLI — the Skill tool cannot reach it, so a file-based prompt
cannot invoke it, and typing a multi-line prompt that starts with `/` into the
TUI is not a reliable way to fire a built-in command. Headless `-p` is also your
own 2026-08-24 ruling on how that gate is invoked. Codex stays a child process
(spec out-of-scope). Reviewers are read-only and never need steering, so the
pane's value there was visibility only; tokens are identical either way.

- **(a) Accept**: conformance + ponytail visible in the sidebar, security +
  codex as console lines.
- **(b) Override**: all three Claude reviewers in panes, accepting that
  security's slash delivery through the TUI is unproven and may silently not
  fire the command — I do not recommend this without a verified delivery
  mechanism.

**Recommendation: (a).**

A:

---

## Owner answers (2026-08-26, round 3)

**Runaway guard: DELETED ENTIRELY.** Supersedes round 2's "keep it, unify it
with blocked-and-hold". The owner's objection is decisive and should be recorded
so nobody re-proposes it: *there is no defensible threshold*. A large feature's
build stage legitimately outspends a small feature's entire run, so any fixed
number is either tight enough to block real work or loose enough to miss a
runaway. And the 5-hour rate-limit window is a real, externally enforced ceiling
that fires regardless — a guard would only ever trip before the thing that
actually protects you.

The feature itself replaces the guard: a looping stage is invisible today
*because it is headless*. In a pane you watch it loop and stop it. Visibility is
the guard, and it needs no threshold. Build no runaway mechanism, and do not
reintroduce `--max-budget-usd` under another name.

**Reviewer placement (architect item 4): accepted as recommended.** Conformance
and ponytail run as pane agents; `/security-review` stays a headless `-p` child
because it is a CLI built-in slash command no pane-safe delivery can reach;
codex stays a child. This is a property of the tools, not a design choice.

**Probity shim: shrink it, and write the ADR.** Both folded into this feature.

The shim (`.claude/hooks/probity-subagent-shim.mjs`) does two jobs, and only one
is a workaround:

1. *Subagent transcript rewrite* — the real workaround. Claude Code sets the hook
   payload's `transcript_path` to the SESSION transcript even for a subagent
   call, so Probity could not see the failing test a subagent had just written
   and denied every implementation write. This exists because v1 ran the
   developer as a subagent.
2. *Direct binary invocation* — `node node_modules/@nizos/probity/dist/bin.js`
   instead of the plugin's `npx @nizos/probity`. Not a workaround: an
   improvement. `npx` resolves on EVERY Bash/Write/Edit call, and the shim's own
   comment calls a shell-spawned npx needless attack surface.

Under this feature every stage is a top-level session, so `agent_id` is never
present and job 1 becomes dead code (~30 lines, including the recursive
subagent-transcript search). Job 2 stays.

TIMING IS LOAD-BEARING: the v1 pipeline is being used to build this feature, and
its developer IS a subagent. Removing job 1 before the pane pipeline is the norm
would disable the TDD gate for the very build in progress. The removal task must
therefore be sequenced LAST, after pane execution works.

Keep `probity@probity` **disabled**. Enabling it alongside the shim would
double-gate, and the plugin's `npx` path is the worse of the two.

**ADR required.** Nothing on disk records why the plugin is disabled; the owner
could not remember and it had to be reconstructed from a file header and a
plugin manifest. One ADR in `docs/adr/` so the next person does not "fix" it back
to the plugin and reintroduce `npx` on every tool call.
