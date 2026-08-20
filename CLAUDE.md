# AMJ Trade Direct / OpenFrame

CPQ web app for trade aluminium windows/doors. React + Vite customer site (`src/`) and ops console (`src/ops/`), Hono Cloudflare Worker API (`worker/routes/` thin, logic in `worker/lib/`), D1 database (sequential `migrations/`), Sanity CMS catalogue. Tests: node:test suites in `scripts/tests/` (see `test:*` scripts in package.json for ownership), Playwright E2E in `scripts/tests/web/`.

## Feature pipeline (agent workflow)

For substantive work — a new capability, schema change, or anything spanning multiple files — orchestrate the dedicated agents in `.claude/agents/`, in order:

0. **Grill (orchestrator + user, main thread)** — before anything is specced, run `mattpocock-skills:grill-me` with the user on the raw ask: stress-test the idea itself — the problem behind it, whether it's worth building, what's being assumed — **and pin down the actors**: who is this for, which canonical actor in `CONTEXT.md` (or a new/sharpened one), and what they need in their own terms. The user is the only primary source on actor needs available to this pipeline; the grill is where that knowledge is extracted, not assumed. Grilled conclusions must include an actors-and-needs section that feeds the spec verbatim; a new or sharpened actor definition also goes to the architect for `CONTEXT.md`. This is the only stage that can interrogate the user interactively; subagents never can. Default for every full-pipeline feature; only the user may wave it off ("skip the grill"), never the orchestrator's own judgment. Not used for the dev+tester tier or direct edits.
1. **product-manager** → spec with acceptance criteria, taking the grill's conclusions as input
2. **architect** → design (files, interfaces, migrations, test plan)
3. **ux-designer + ui-designer** → interaction spec **+ visual mock** (only if the feature adds/changes UI): the ux-designer owns structure and flows, and the ui-designer **always** gives the mock its visual treatment before it goes to the **UX mock gate** (below) — the user approves the look that will actually ship, never a wireframe that gets its look later.
4. **developer** → test-first implementation. **Every test artifact the design named must exist when this stage ends** — a design that names `scripts/tests/web/foo.spec.ts` is not evidence the file was written. Deciding not to build one is legitimate; doing it silently is not, and the reason goes to the user at the moment of the decision, never in the final report.
5. **ui-designer** → visual polish/audit of implemented UI, using impeccable (only if UI changed; always runs here in addition to its mock-stage pass)
6. **tester** → independent verification against the acceptance criteria. **A feature that adds or changes UI cannot PASS without Playwright coverage in `scripts/tests/web/`.** node:test suites exercise the worker and the data layer; they cannot see anything the client decides. Two MAJOR referral findings — a program-Off switch that replaced the whole landing page, and payment holds the API served and nothing rendered — were invisible to 104 green node tests because the server-served HTML was byte-identical in both states.
7. **architect** (returning) → design-conformance review of the final diff against the design — structure only, not a second bug hunt (skip when step 2 produced no design doc). Conformance includes **absence**: a file the design named and the diff never created is a divergence, and the easiest one to miss, because a review that reads the diff only sees what was written.
8. **product-manager** (returning) → acceptance: walks the spec's criteria against the tester's evidence, checks for silent descoping/scope creep and unvetoed `ASSUMED:` tags, issues an acceptance verdict — then the orchestrator presents it to the user for final sign-off

Pass each agent the previous agent's output. Steps 7–8 findings go back through the developer loop like any review.

**Cross-cutting — Codex external review. THE STOP-GATE DOES NOT COVER ORCHESTRATED WORK. You must invoke it explicitly.**

The stop-gate inspects **the main agent's turn**. When the orchestrator delegates implementation to subagents — which is what this pipeline does — the main turn contains no edits, so the gate allows, correctly by its own logic, having reviewed nothing.

Measured on 2026-08-20: **50 stop-gate jobs, 50 ALLOWs, zero files read.** Every one passed on *"the previous Claude turn made no direct code changes."* Two features totalling ~12,400 lines — the recommendation-model redesign and the thermal model — reached production with no external review at all. Run afterwards, the review found three real defects, one of them a cross-project data-integrity hole in a staff route and one that had already inflated a production statistic 7.5×.

**So the orchestrator MUST run an explicit review at the end of every feature, before PM acceptance:**

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/codex-companion.mjs" review --wait --base <feature-base-ref> --scope branch
```

(or `/codex:review --wait --base <ref> --scope branch` when a human is driving). Review each feature's diff separately — a combined review of two features skims. Findings route to the developer like any other review, test-first.

**And check the gate is FINDING things, not merely switched on.** Confirming `stopReviewGate: true` at session start proves nothing; the jobs under `~/.claude/plugins/data/codex-inline/state/<workspace>/jobs/` record what each run actually inspected. A gate that is enabled and reviews nothing is worse than one that is off, because it leaves a record of review that never happened.

Its verdict remains independent of every agent above, and it runs read-only.

### Oversized efforts: wayfinder first

When an effort is too big for one session's pipeline run — multiple features, a foggy migration, a route that isn't visible yet — chart it with the `mattpocock-skills:wayfinder` skill **before** the pipeline: a map issue plus decision tickets on the tracker (see `docs/agents/issue-tracker.md`), resolved one at a time. Each resolved region then runs through the pipeline as a normally-sized feature. The product-manager is instructed to flag when an ask needs this instead of a monolithic spec.

### Sizing: which stages engage

- **Full pipeline** — anything that adds/changes a business rule or capability, touches DB schema/migrations, spans multiple concerns, or raises a question only the user/spec can answer. When any stage would have a real decision to make, it runs.
- **Developer + tester only** — a bounded bug fix or refactor whose correct behaviour is already unambiguous (reproducible bug, clear expected output, no schema change, no new interface). No PM/architect/design stages: nothing for them to decide.
- **Direct (no agents)** — mechanical edits where a wrong guess is impossible or trivially caught: typos, copy/wording, comments/docs, config values, formatting, dependency bumps.

Deciding rule: it's the *decision content* that sizes a change, not the line count — a one-line change to GST rounding is full-pipeline; a 200-line mechanical rename is direct. If genuinely torn between tiers, ask the user in one line rather than guessing expensive.

**Manual overrides (always win over the heuristic):**
- "quick" / "no pipeline" / "just do it directly" → direct mode, no agents, regardless of size.
- "full pipeline" / "run the team" → full pipeline, even for something tiny.
- The enforced guardrails below are NOT disabled by any tier or override: Probity still gates in-scope writes, and the **explicit end-of-feature Codex review is still required** — the stop-gate alone does not cover subagent work (see the cross-cutting note above). Skipping the team never means skipping review.

### Decision gates (iterative — loop until no questions remain)

Subagents cannot talk to the user mid-run, so decisions are batched at stage boundaries — but the gate is a **loop, not a single exchange**. When the product-manager or architect returns with a "Decisions needed" section:

1. The orchestrator puts the questions to the user (AskUserQuestion, with the agent's recommendations).
2. The answers go back **to the same agent via SendMessage** (so it keeps its context — never a fresh spawn), which revises the spec/design accordingly.
3. If the answers changed decisions or raised new questions, the agent returns a new "Decisions needed" section → repeat from 1.
4. The next pipeline stage starts only when the agent returns with an empty "Decisions needed" list.

**UX mock gate (hard rule — no assumption fallback):** when a feature adds or changes UI, implementation must not start until the user has seen a visual representation of the intended solution and explicitly approved it. The ux-designer delivers a self-contained static HTML mock (saved under `docs/mocks/`); the orchestrator renders it to the user (SendUserFile with display render, or an Artifact) and asks for approval. Feedback goes back to the same ux-designer via SendMessage; revised mock → re-present; loop until the user says it's acceptable. If the user is unavailable, the pipeline **pauses at this gate** — unlike question gates, there is no `ASSUMED:` fallback here. "Approved with tweaks" must be re-stated in the interaction spec so the developer builds the approved version, not the first draft.

The list should shrink every round; if a gate is still churning after ~3 rounds, that usually means the underlying goal is unsettled — say so to the user plainly instead of another round of questions. Ask only user-owned decisions — business rules, scope, trade-offs with cost or customer-facing consequences; never things derivable from the code or spec. If the user is unavailable or a point is minor, proceed on an assumption explicitly tagged `ASSUMED:` in the spec/design so it can be vetoed at review. Developer/tester never open new question channels — a gap they hit is a spec/design defect and goes back up the pipeline as a finding.

### Review loops (fixes always go through the developer)

Reviewers report; only the developer fixes implementation code. Never patch a reviewer's finding inline in the orchestrator, and never let a reviewer "just fix it while in there".

- **tester ⇄ developer loop:** a FAIL verdict goes back to the developer as findings (each with its failing test or reproducing command). The developer fixes test-first; the tester then re-verifies from scratch — findings fixed, nothing regressed, criteria still met. Repeat until PASS. After 3 failed rounds, stop and surface the impasse to the user instead of grinding.
- **Codex ⇄ developer loop:** review findings are routed to the developer the same way (for a code defect, first write the failing test that captures it, then fix). The gate re-reviews automatically on the next stop attempt **only when the fix was a direct edit**; when a subagent made it, re-run the explicit review — the gate will otherwise allow having read nothing. Codex runs in a read-only sandbox: it can never edit the repo, only report.

### Runaway protection (token burn)

Every loop in this pipeline must converge or escalate — never grind:

- **Round caps:** tester⇄developer and each decision gate cap at 3 rounds; the Codex stop-gate fix cycle caps at 3 consecutive BLOCKs on the same piece of work. Hitting a cap means stop and present the impasse to the user with both sides' positions — a stalled loop is a disagreement to adjudicate, not a retry problem.
- **No zombie respawns:** if an agent returns empty, off-topic, or the same output twice, do not relaunch it with the same prompt — diagnose (wrong inputs? missing context? task too big?) or escalate. Kill visibly stuck background agents (TaskStop) rather than waiting them out.
- **Progress test between rounds:** each loop round must change something concrete (a finding resolved, a question answered, a diff advanced). Two rounds with no delta = stalled = escalate.
- **Scale honestly:** small fixes skip the pipeline entirely; don't spawn six agents for a one-line change.

### Token economy (spend agents where they buy something)

A spawn costs a full context rebuild: the new agent re-discovers what the orchestrator already knows, and *exploration* — not reasoning — is the dominant cost of an agent run. A spawn earns its keep when it buys independence, parallelism, context hygiene, or a test of whether the written artifact is self-sufficient. When it buys none of those, it is overhead.

- **Warm agents, not fresh spawns.** One agent per role per feature, continued with SendMessage for the next slice, the next round, the next set of findings — never a new spawn for more of the same work. A resumed agent keeps its context and its cache; a fresh one pays for the codebase again. (This is already how decision gates work; it applies to implementation and verification too. agent-guard's per-agent send cap — raised to 20 precisely to allow this — is a convergence checkpoint when hit, never a cue to respawn a fresh agent.)
- **Pass discovery, don't make agents redo it.** Everything already found — file paths with line numbers, grep results, the design's affected-files index, which suite owns which test — goes into the next agent's prompt verbatim, with an instruction to trust it rather than re-derive it. Agents must read the files they edit; they must not search for them twice.
- **The orchestrator may implement bounded slices.** When the design is fully specified, the slice is small (a handful of files), and the orchestrator already holds the design and those files in context, implementing inline beats briefing a cold developer — and it plays well with the TDD gate, since the orchestrator runs the red test then writes in the same transcript the validator reads. Spawn the developer instead when the work is large or parallelisable, when it would flood the orchestrator's context, or when the design is a durable deliverable whose self-sufficiency deserves testing by a cold reader. **The orchestrator may implement, but never reviews its own work** — the tester is always a separate agent; reviewer independence is what the pipeline actually depends on, implementer independence is not.
- **Batch turns; don't narrate.** Every turn that changed code pays a stop-gate toll (the security-guidance LLM diff review, plus the Codex review **when the main turn itself edited code** — on an orchestrated turn that half no-ops, which is the defect described above, not a saving to bank). Ending a turn to report progress nobody asked for pays that toll for nothing. **The orchestrator decides the batch** — it ends a turn only where the user must decide, approve, or see something (a decision gate, the mock gate, a finished-and-verifiable slice, an impasse, or a genuine need for input), not to announce "now starting step 3". When in doubt, keep working: the user can always interrupt, but a toll already paid cannot be refunded. **This is not licence to go dark** — an interjection that changes the work is worth more than the toll it costs, so keep turns long without keeping the user uninformed.
- **A long agent run must survive being killed.** Two agents died to a machine restart on 2026-08-17, roughly 100 minutes each, and their work survived only because it happened to be sitting in the shared working tree — one had written a migration and a red test, the other 377 lines of Playwright harness, and neither had reported a word. An agent expected to run more than a few minutes must land work incrementally (a file written, a test added, a note in the build notes) rather than holding everything for a final report, and its brief must say so. **Check the working tree before assuming a killed agent lost its work, and before briefing a replacement** — both of those agents had effectively finished. For inline slices the orchestrator's own commits are the checkpoint; there is no reason to hold three fixes for one commit.
- **Don't verify a moving diff.** Independent verification is the most expensive stage in the pipeline and the easiest to pay for twice. The referral tester's FAIL report was pinned to a commit and was stale within the hour — nine commits later every finding, every AC-table row and every executed abuse case had to be redone, because evidence against a diff that has moved proves nothing. Start the tester only when implementation has stopped changing: findings routed, fixes landed, suites green, no agent still holding a write. If something must be checked early, verify a *finished slice* rather than the whole feature mid-flight, and re-run the tester afterwards rather than counting the early pass as coverage.

## Enforced guardrails (don't fight them)

- **TDD (Probity):** writes to `worker/**`, `src/data/**`, and `scripts/tests/**` are blocked unless recent session history shows a failing test the write addresses. Work red → green → refactor. Scope lives in `probity.config.ts`.
- **Codex stop-gate:** fires when the MAIN turn changed code — which orchestrated work does not. It is not a substitute for the explicit end-of-feature review above; treat it as a backstop for direct edits only, and address any findings rather than bypassing.
- **Codex infrastructure failure ≠ review findings.** If the gate blocks with a *task failure* (network, service outage, auth, quota, timeout) rather than actual findings: retry once, and if it fails again, stop and tell the user plainly — the work is done but unreviewed, and the options are (a) wait and run `/codex:review --wait` later, (b) temporarily disable the gate with `/codex:setup --disable-review-gate` and re-enable after, or (c) user pressing Esc to end the turn. Never grind retries against a dead service, and never present unreviewed work as reviewed. If the gate *silently skips* because the Codex CLI is missing (that path fails open), flag the missing review to the user rather than letting it pass unmentioned.
- **Security — defence in depth, starting at design.** This product holds financial PII (payout/bank details, ABNs) and customer pricing data, with payments on the roadmap; security is a design input, not a review afterthought. The layers, in order of when they bite:
  1. **Design-time (architect):** every design touching sensitive data, auth, uploads, money, or sessions must carry a Security section — data classification, trust boundaries, per-endpoint authorization with the exact account-scoping filter, abuse cases. "Security: no sensitive surface" must be stated explicitly when it's true.
  2. **Spec-time (product-manager):** sensitive features get negative Given–When–Then abuse-case criteria; the tester executes them for real (attempts the forbidden action, records the denial).
  3. **Always-on (security-guidance plugin):** pattern warnings on edits + LLM security diff-review on Stop.
  4. **Every feature, explicitly invoked:** the Codex review over that feature's diff (the stop-gate alone does not see subagent work — see the cross-cutting note above).
  5. **Stage gate:** for auth/upload/payment/PII-touching features, the orchestrator runs the `security-review` skill on the branch before PM acceptance; findings route to the developer.
  6. **Deterministic sweep (CI):** `.github/workflows/security-sweep.yml` runs the Semgrep OSS engine (registry rules, logged out, telemetry off) on every push — fails on ERROR-severity findings. Delete the file to remove the layer; nothing depends on it.
  7. **Deep scan (on demand):** the `claude-security` plugin (`/claude-security` → scan changes / scan codebase / suggest patches — findings adversarially verified before reporting). Run "scan changes" before merging any sensitive-surface feature; "scan codebase" at milestones.
- **agent-guard** (`.claude/hooks/agent-guard.mjs`): mechanically enforces the runaway caps — near-identical agent respawns, >20 agent spawns/session, >8 messages to one agent, >5 workflow runs all pause for explicit user approval. If it fires, treat it as a stall signal: diagnose, don't just re-approve. Thresholds: `.claude/hooks/agent-guard.config.json` (optional).

## Agent skills

Per-repo configuration for the mattpocock engineering skills lives in `docs/agents/`:

- `issue-tracker.md` — issues live on GitHub Issues at `siaribuild/apertly` (always pass `-R siaribuild/apertly` to `gh`); wayfinder maps are issues labelled `wayfinder:map` with decision tickets as sub-issues.
- `domain.md` — single context: `CONTEXT.md` at root, ADRs in `docs/adr/`.
- `triage-labels.md` — default five-label triage vocabulary.

## Deploy protocol

Deploys are manual and explicit — a git push never deploys anything. Before any production deploy (`npm run cf:deploy` / `wrangler deploy` / `npx sanity deploy`):

1. Full local gates green (`npm test`, `npm run typecheck:gate`).
2. The deployed commit's **security-sweep CI run is green** — check with `gh run list -R siaribuild/apertly --commit <sha>`; never deploy a commit whose sweep failed or hasn't finished.
3. For changes touching sensitive surfaces (auth, payout/bank data, payments, uploads): smoke-test a preview first — `npx wrangler versions upload` gives a preview URL without moving production traffic; verify, then promote with `npx wrangler versions deploy`. Preview versions share production bindings (including the live D1) — read-only smoke checks only, never destructive tests.
4. Production deploys always require the user's explicit confirmation (enforced by auto-mode) — the old blanket deploy authorization is superseded.

## Commands

- `npm run typecheck:gate` — TS gate (fatal errors only)
- `npm test` — full node:test battery (typecheck + all suites); `npm run test:<area>` for one suite
- `npm run test:web` — Playwright E2E (needs dev server)
- `npm run dev` / `npm run dev:api` — Vite frontend / Wrangler worker
- `npm run db:migrate:local` — apply D1 migrations locally

## House rules

- One place per fact: pricing, GST, quote state each have a single source of truth — extend, don't duplicate.
- Migrations are append-only; number after the highest existing file. **Any `migrations/` change: load the `d1-migration-safety` skill first (`.claude/skills/d1-migration-safety/`) — a table rebuild once cascade-deleted production rows.**
- Domain vocabulary lives in `CONTEXT.md` — read it before designing or speccing; update it (architect owns it) when a term is added or sharpened.
- Keep logic out of React components — lift into `src/data/` or `worker/lib/` where it's testable.
- GST display must respect the account's ex/inc preference on every customer surface.
