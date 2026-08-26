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
