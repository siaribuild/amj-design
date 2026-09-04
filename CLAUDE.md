# AMJ Trade Direct / OpenFrame

CPQ web app for trade aluminium windows/doors. React + Vite customer site (`src/`) and ops console (`src/ops/`), Hono Cloudflare Worker API (`worker/routes/` thin, logic in `worker/lib/`), D1 database (sequential `migrations/`), Sanity CMS catalogue. Tests: node:test suites in `scripts/tests/` (see `test:*` scripts in package.json for ownership), Playwright E2E in `scripts/tests/web/`.

## Feature pipeline

Run by `scripts/pipeline/conduct.mjs` — a script, not a model. Same agents
(`.claude/agents/*.md`, unmodified), same stages, same gates as v1; the
orchestrator is gone because it cost 2.17B context tokens per feature to
produce 5M of output. Full rationale and tuning: `docs/pipeline/PIPELINE-V2.md`.
Rollback: `docs/pipeline/v1-backup/RESTORE.md` (one `cp`; git tag `pipeline-v1`).

```bash
node scripts/pipeline/conduct.mjs start <slug> "<the ask>"
node scripts/pipeline/conduct.mjs ui on      # if it adds/changes UI
node scripts/pipeline/conduct.mjs next       # repeat until a gate or the end
node scripts/pipeline/conduct.mjs report     # cost + token split per stage
```

    spec → design → [ux] → build → [polish] → verify → review → accept

**Stage 0, the grill, is not conducted** — it is the only stage that talks to
the user. Run `/grilling` yourself in its own pane and paste the conclusions,
including the actors-and-needs section, into `docs/runs/<slug>/00-ask.md`. It
stress-tests the idea itself and pins down which canonical actor in `CONTEXT.md`
this serves. Default for every full-pipeline feature; only the user may wave it
off, never the orchestrator's judgment.

Key mechanics, so a session reading this knows what to expect:

- **Stages are handed paths, never contents.** Nothing accumulates in a
  conducting context. If you find yourself relaying one agent's output into
  another's prompt, you have rebuilt v1's most expensive habit.
- **`02-tasks.json` is executable.** The architect slices the build; the
  conductor runs one short developer session per slice, each given exact file
  paths so it never searches. Every test file the design names must appear in
  some task's `files` — a named-but-never-created test file is the failure this
  pipeline has repeated most.
- **Gates stop the conductor, not a model.** `DECISIONS.md` (answer inline with
  `A:`, then `conduct answer` — it resumes that stage warm), the mock gate (no
  implementation until the user approves `docs/mocks/<slug>.html`; no assumption
  fallback), and final sign-off.
- **Reviewers report; only the developer fixes.** Route a finding with
  `conduct fix "<finding>"`, which fixes test-first, then re-run `verify`.
  Never patch a reviewer's finding inline, and never let a reviewer fix in place.
- **The `review` stage is mandatory and runs four reviewers in parallel** —
  architect conformance, `/security-review`, `ponytail-review`, and Codex over
  the feature diff. A Codex *infrastructure* failure is not a clean review: say
  so plainly rather than presenting unreviewed work as reviewed.

### Oversized efforts: wayfinder first

When an effort is too big for one run — multiple features, a foggy migration —
chart it with `mattpocock-skills:wayfinder` **before** the pipeline: a map issue
plus decision tickets on the tracker (`docs/agents/issue-tracker.md`), resolved
one at a time. Each resolved region then runs as a normally-sized feature.

### Sizing: which tier engages

- **Full pipeline** — adds/changes a business rule or capability, touches DB
  schema/migrations, spans multiple concerns, or raises a question only the
  user can answer.
- **Developer + tester only** — a bounded bug fix or refactor whose correct
  behaviour is already unambiguous. `conduct fix` covers this.
- **Direct (no pipeline)** — typos, copy, comments, config values, formatting,
  dependency bumps.

It is the *decision content* that sizes a change, not the line count: a one-line
change to GST rounding is full-pipeline; a 200-line mechanical rename is direct.
If genuinely torn, ask in one line rather than guessing expensive.

Manual overrides always win: "quick" / "just do it directly" → direct;
"full pipeline" / "run the team" → full, even for something tiny. Neither
override disables Probity or the mandatory `review` stage.

## Enforced guardrails (don't fight them)

- **TDD (Probity):** writes to `worker/**`, `src/data/**`, and `scripts/tests/**` are blocked unless recent session history shows a failing test the write addresses. Work red → green → refactor. Scope lives in `probity.config.ts`.
- **Codex stop-gate:** fires when the MAIN turn changed code. Under v1 this made it structurally blind to orchestrated work — measured 2026-08-20: 50 jobs, 50 ALLOWs, zero files read, because the orchestrator's own turns contained no edits. Under v2 every stage *is* a main turn, so the gate finally sees the developer's edits. It remains a backstop, not a substitute for the mandatory `review` stage; address findings rather than bypassing.
- **Codex infrastructure failure ≠ review findings.** If the gate blocks with a *task failure* (network, service outage, auth, quota, timeout) rather than actual findings: retry once, and if it fails again, stop and tell the user plainly — the work is done but unreviewed, and the options are (a) wait and run `/codex:review --wait` later, (b) temporarily disable the gate with `/codex:setup --disable-review-gate` and re-enable after, or (c) user pressing Esc to end the turn. Never grind retries against a dead service, and never present unreviewed work as reviewed. If the gate *silently skips* because the Codex CLI is missing (that path fails open), flag the missing review to the user rather than letting it pass unmentioned.
- **Security — defence in depth, starting at design.** This product holds financial PII (payout/bank details, ABNs) and customer pricing data, with payments on the roadmap; security is a design input, not a review afterthought. The layers, in order of when they bite:
  1. **Design-time (architect):** every design touching sensitive data, auth, uploads, money, or sessions must carry a Security section — data classification, trust boundaries, per-endpoint authorization with the exact account-scoping filter, abuse cases. "Security: no sensitive surface" must be stated explicitly when it's true.
  2. **Spec-time (product-manager):** sensitive features get negative Given–When–Then abuse-case criteria; the tester executes them for real (attempts the forbidden action, records the denial).
  3. **Always-on (security-guidance plugin):** pattern warnings on edits + LLM security diff-review on Stop.
  4. **Every feature, explicitly invoked:** the Codex review over that feature's diff (the stop-gate alone does not see subagent work — see the cross-cutting note above).
  5. **Stage gate — the orchestrator runs this itself, every full-pipeline feature.** Before PM acceptance:

     Conducted automatically as part of pipeline v2's mandatory `review` stage
     (`docs/pipeline/PIPELINE-V2.md`), capped like every other stage. Run by
     hand only as a fallback — outside the conductor, always cap the window:

     ```bash
     claude -p "/security-review" --permission-mode plan --autocompact 600000 --strict-mcp-config
     ```

     `security-review` is a **built-in command compiled into the CLI**, not a skill — so the `Skill` tool cannot reach it and there is no file for it on disk (verified 2026-08-24, do not go looking). Headless `-p` keeps it non-interactive; `--permission-mode plan` keeps it read-only. It reviews the current branch's diff and reports findings above an ~80% confidence bar, saying so explicitly when nothing clears. Findings route to the developer like any review. It runs on Anthropic quota, so it stays available when the Codex layer is quota-blocked — the two are independent on purpose. **Owner ruling 2026-08-24: a gate only he can fire is not a pipeline stage. Never downgrade this to "ask the user to run it".**
  6. **Deterministic sweep (CI):** `.github/workflows/security-sweep.yml` runs the Semgrep OSS engine (registry rules, logged out, telemetry off) on every push — fails on ERROR-severity findings. Delete the file to remove the layer; nothing depends on it.
  7. **Deep scan (on demand):** the `claude-security` plugin (`/claude-security` → scan changes / scan codebase / suggest patches — findings adversarially verified before reporting). Run "scan changes" before merging any sensitive-surface feature; "scan codebase" at milestones.
- **agent-guard** (`.claude/hooks/agent-guard.mjs`): mechanically enforces the runaway caps — near-identical agent respawns, >20 agent spawns/session, >8 messages to one agent, >5 workflow runs all pause for explicit user approval. If it fires, treat it as a stall signal: diagnose, don't just re-approve. Thresholds: `.claude/hooks/agent-guard.config.json` (optional).
- **ponytail — always on, and it reaches subagents.** Owner decision 2026-08-24, on several senior developers' recommendation. YAGNI ladder: does this need to exist → already in the codebase → stdlib → native platform → installed dependency → one line → minimum that works. It ships a `SubagentStart` hook, so the architect and developer get it too — which is the point, because this repo's over-engineering has been *specified* rather than typed: `draft_order_line.selected_candidate_id` (written, never read), `segment_requirements_json` and its two siblings (populated on every split, read by nothing), `split_combinability` (an enum value commented "DECLARED AND NEVER EMITTED"), and the `certified`/`dataSource` pair the owner ruled has no value while it was still downgrading line status. ~983 tokens/session.

  Three reconciliations, because it will otherwise fight things this repo requires:

  1. **A red test is never "unrequested code".** Probity mandates it and ponytail's own rule is "anything explicitly requested" is off-limits to laziness. An agent that argues a failing test is scaffolding has misread both. Ponytail shortens the *implementation*, never the test that justified it.
  2. **Comments are not code** (owner, 2026-08-24). Ponytail's "delete the explanation" governs unrequested *response prose*, not source comments — this codebase's rationale comments are deliberate and stay. Where the two seem to disagree, the house rule wins: match the surrounding comment density.
  3. **Its own "when NOT to be lazy" list is binding here**: input validation at trust boundaries, error handling that prevents data loss, security measures, accessibility. This product holds financial PII; none of that is ever the shortest diff.

  It is a guardrail against excess, **not** a replacement for Probity, the tester, or any review layer. Two skills earn a place in the pipeline: **`ponytail-review`** on the feature diff alongside the Codex review at step 7 (it looks for exactly the class of defect the reviewers above it keep missing — dead flexibility and speculative structure), and **`ponytail-debt`**, which harvests the `ponytail:` comments a deliberate shortcut leaves behind so "later" does not mean "never". `ponytail-audit` is a whole-repo sweep for milestones.

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
