# AMJ Trade Direct / OpenFrame

CPQ web app for trade aluminium windows/doors. React + Vite customer site (`src/`) and ops console (`src/ops/`), Hono Cloudflare Worker API (`worker/routes/` thin, logic in `worker/lib/`), D1 database (sequential `migrations/`), Sanity CMS catalogue. Tests: node:test suites in `scripts/tests/` (see `test:*` scripts in package.json for ownership), Playwright E2E in `scripts/tests/web/`.

## Feature pipeline (agent workflow)

For substantive work — a new capability, schema change, or anything spanning multiple files — orchestrate the dedicated agents in `.claude/agents/`, in order:

1. **product-manager** → spec with acceptance criteria
2. **architect** → design (files, interfaces, migrations, test plan)
3. **ux-designer + ui-designer** → interaction spec **+ visual mock** (only if the feature adds/changes UI): the ux-designer owns structure and flows, and the ui-designer **always** gives the mock its visual treatment before it goes to the **UX mock gate** (below) — the user approves the look that will actually ship, never a wireframe that gets its look later.
4. **developer** → test-first implementation
5. **ui-designer** → visual polish/audit of implemented UI, using impeccable (only if UI changed; always runs here in addition to its mock-stage pass)
6. **tester** → independent verification against the acceptance criteria
7. **architect** (returning) → design-conformance review of the final diff against the design — structure only, not a second bug hunt (skip when step 2 produced no design doc)
8. **product-manager** (returning) → acceptance: walks the spec's criteria against the tester's evidence, checks for silent descoping/scope creep and unvetoed `ASSUMED:` tags, issues an acceptance verdict — then the orchestrator presents it to the user for final sign-off

Pass each agent the previous agent's output. Steps 7–8 findings go back through the developer loop like any review.

### Sizing: which stages engage

- **Full pipeline** — anything that adds/changes a business rule or capability, touches DB schema/migrations, spans multiple concerns, or raises a question only the user/spec can answer. When any stage would have a real decision to make, it runs.
- **Developer + tester only** — a bounded bug fix or refactor whose correct behaviour is already unambiguous (reproducible bug, clear expected output, no schema change, no new interface). No PM/architect/design stages: nothing for them to decide.
- **Direct (no agents)** — mechanical edits where a wrong guess is impossible or trivially caught: typos, copy/wording, comments/docs, config values, formatting, dependency bumps.

Deciding rule: it's the *decision content* that sizes a change, not the line count — a one-line change to GST rounding is full-pipeline; a 200-line mechanical rename is direct. If genuinely torn between tiers, ask the user in one line rather than guessing expensive.

**Manual overrides (always win over the heuristic):**
- "quick" / "no pipeline" / "just do it directly" → direct mode, no agents, regardless of size.
- "full pipeline" / "run the team" → full pipeline, even for something tiny.
- The enforced guardrails below are NOT disabled by any tier or override: Probity still gates in-scope writes and the Codex stop-gate still reviews every code-changing turn. Skipping the team never means skipping review.

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
- **Codex ⇄ developer loop:** the stop-gate's BLOCK findings are routed to the developer the same way (for a code defect, first write the failing test that captures it, then fix). The gate re-reviews automatically on the next stop attempt. Codex runs in a read-only sandbox — it can never edit the repo, only report.

### Runaway protection (token burn)

Every loop in this pipeline must converge or escalate — never grind:

- **Round caps:** tester⇄developer and each decision gate cap at 3 rounds; the Codex stop-gate fix cycle caps at 3 consecutive BLOCKs on the same piece of work. Hitting a cap means stop and present the impasse to the user with both sides' positions — a stalled loop is a disagreement to adjudicate, not a retry problem.
- **No zombie respawns:** if an agent returns empty, off-topic, or the same output twice, do not relaunch it with the same prompt — diagnose (wrong inputs? missing context? task too big?) or escalate. Kill visibly stuck background agents (TaskStop) rather than waiting them out.
- **Progress test between rounds:** each loop round must change something concrete (a finding resolved, a question answered, a diff advanced). Two rounds with no delta = stalled = escalate.
- **Scale honestly:** small fixes skip the pipeline entirely; don't spawn six agents for a one-line change.

## Enforced guardrails (don't fight them)

- **TDD (Probity):** writes to `worker/**`, `src/data/**`, and `scripts/tests/**` are blocked unless recent session history shows a failing test the write addresses. Work red → green → refactor. Scope lives in `probity.config.ts`.
- **Codex stop-gate:** when a turn changed code, a Codex review runs before the turn may end; address its findings rather than bypassing.
- **Codex infrastructure failure ≠ review findings.** If the gate blocks with a *task failure* (network, service outage, auth, quota, timeout) rather than actual findings: retry once, and if it fails again, stop and tell the user plainly — the work is done but unreviewed, and the options are (a) wait and run `/codex:review --wait` later, (b) temporarily disable the gate with `/codex:setup --disable-review-gate` and re-enable after, or (c) user pressing Esc to end the turn. Never grind retries against a dead service, and never present unreviewed work as reviewed. If the gate *silently skips* because the Codex CLI is missing (that path fails open), flag the missing review to the user rather than letting it pass unmentioned.
- **Security hooks (security-guidance + semgrep plugins):** pattern warnings on edits, semgrep scanning around tool use, and an LLM security diff-review on Stop — all automatic. Additionally, when a feature touches auth (customer/ops boundary), file uploads, payments, or session handling, the orchestrator runs the `security-review` skill on the branch before the product-manager acceptance step; its findings route to the developer like any review.
- **agent-guard** (`.claude/hooks/agent-guard.mjs`): mechanically enforces the runaway caps — near-identical agent respawns, >20 agent spawns/session, >8 messages to one agent, >5 workflow runs all pause for explicit user approval. If it fires, treat it as a stall signal: diagnose, don't just re-approve. Thresholds: `.claude/hooks/agent-guard.config.json` (optional).

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
