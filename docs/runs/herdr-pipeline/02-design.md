# Design — run the pipeline natively on herdr

Run: `herdr-pipeline`. Spec: `docs/runs/herdr-pipeline/01-spec.md` (42 criteria,
authoritative). Decisions: `DECISIONS.md` through **round 3** (2026-08-26):
runaway guard **deleted entirely** (supersedes round 2), reviewer placement
accepted as recommended, probity-shim shrink + ADR folded into this feature,
skeleton cockpit with stage panes on demand (round 2 D2, still binding).

Everything below was designed against the **installed binaries** (herdr 0.8.2,
claude CLI help, live probes on 2026-08-26), not recall. Revision note: the
first version of this design worked around a broken `herdr agent start`; the
blocker's true cause was found and fixed (finding 2), so this revision returns
to the documented recipe.

---

## 1. Empirical findings that bind this design (probed 2026-08-26)

Established by running the tools; the developer must not re-litigate them. One
item remains OPEN for t4's live check.

1. **`claude --help`:** `--session-id <uuid>`, `--autocompact <tokens>`,
   `--permission-mode`, `--agent`, `--model`, `--mcp-config`,
   `--strict-mcp-config` are all general flags (not marked print-only).
   `--max-budget-usd` **is print-only** — moot, since round 3 deletes the
   runaway concept outright. (OPEN: `--session-id` accepted by an *interactive*
   boot — verify in t4's live check; the fallback source is finding 5 and is
   confirmed.)
2. **`herdr agent start --kind claude` WORKS — the earlier failure was an
   environment artifact, now fixed.** First diagnosis (restricted pane
   filesystem view) had the symptom right and the cause backwards: the
   orchestrator's own Claude session runs inside the packaged MSIX desktop app,
   whose `%APPDATA%` is redirected to
   `AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming`; the npm
   global prefix — and `claude` itself — had been installed *inside that
   container*. Panes are ordinary unpackaged processes reading the **real**
   `Roaming`, which genuinely had no `npm` directory. The pane was never blind;
   the binary was never there. The owner has since run
   `npm install -g @anthropic-ai/claude-code` from a pane into the real prefix,
   and the documented recipe is verified end to end: `herdr agent start probe
   --kind claude --pane w1:p5` → `agent_status:"idle"`,
   `interactive_ready:true`, agent listed, answered a real prompt.
   **Lasting hazard, recorded:** there are now TWO Claude Code installs already
   drifting — 2.1.232 (containerised, the desktop app's sessions) and 2.1.246
   (real prefix, panes). Pane auth works today; Probity's validator needs the
   CLI logged in. t8 documents this in PIPELINE-V2.md.
3. **`rate_limit_event` exists only in stream-json logs, never in transcripts.**
   Zero record-level occurrences across all of `~/.claude/projects`; present in
   `docs/runs/smoke-test/logs/*.jsonl` with exactly this shape:
   `{"type":"rate_limit_event","rate_limit_info":{"status","resetsAt":<unix
   seconds>,"rateLimitType":"five_hour","overageStatus",
   "overageDisabledReason","isUsingOverage"},"uuid","session_id"}` — **no quota
   figure**, confirming criterion 24. Window anchoring must read the repo's own
   stage logs (§6.3).
4. **Transcripts have a second tier `measure.mjs` never scans:**
   `~/.claude/projects/<proj>/<sessionId>/subagents/*.jsonl`. Those records
   carry full `usage`, `requestId`, `timestamp`, and the **parent** `sessionId`.
   Main transcripts are named `<sessionId>.jsonl` — so a session's files are
   addressable directly, no scan-and-guess (criterion 42 by construction).
5. **Herdr reports a pane agent's session identity** — confirmed live:
   `herdr agent get` returns `agent_session: { kind:"id",
   source:"herdr:claude", value:"<uuid>" }`, fed by the v8 integration's
   `SessionStart` hook (`pane report-agent-session ... --agent-session-id`).
   This is what makes `claude --resume <id>` restore work, and it is the
   fallback for finding 1's OPEN item.
6. **Pane readiness is machine-checkable**: `herdr pane process-info --pane <id>`
   returns the foreground process argv; a bare prompt shows the shell itself
   foreground. This is criterion 36's readiness re-check.
7. **Herdr CLI works from outside a herdr pane** as long as the server runs
   (`HERDR_ENV` unset here, all commands succeeded). Detection = a fast
   `herdr workspace list`, not an env check.
8. **Pane scraping cannot carry a stage's output — HARD CONSTRAINT.**
   `herdr agent read` returns `agent_not_idle` while an agent works; Claude
   runs on the terminal's alternate screen, so scrolled-off rows never enter
   herdr's host scrollback and no `--lines` value recovers them; even idle
   reads truncate (reproduced). Therefore **no data path in this design reads
   a pane**: stage results come from the files a stage writes (`produces`
   check), metering from transcripts, state from `agent wait`/`agent get`.
   `agent read`/`pane read` are diagnostics for a human, only.
9. **Guardrails are present inside panes — verified by probing a live pane
   agent; spec nothing to re-provide.** All six `.claude/agents/*.md`
   definitions, the mattpocock and ponytail skills, plugin caches, `~/.claude`
   settings + hooks (including the herdr integration hook), the repo's
   `node_modules/@nizos/probity`, the Probity TDD gate (active, correctly
   scoped) and the Codex stop-gate (`stopReviewGate: true`, recent ALLOWs).
10. **`herdr notification show <title> --body ...`** exists for operator
    alerts; lifecycle states are `idle|working|blocked|done|unknown`; `done` =
    settled idle after unseen background work; `unknown` proves nothing.

---

## 2. Module layout — where the seams go

Three modules, one new. `conduct.mjs` stays the state machine and the only place
that knows the stage table and run.json; `herd.mjs` is a deep module hiding every
herdr detail behind a narrow interface; `measure.mjs` stays the single source of
truth for token accounting (house rule: one place per fact — no second
accounting mechanism, per the spec's first ASSUMED).

```
scripts/pipeline/conduct.mjs   state machine, STAGES, run.json, prompts, gates
scripts/pipeline/herd.mjs      NEW — herdr adapter (detection, cockpit, panes,
                               agent start/wait, notify). No run.json access.
scripts/pipeline/measure.mjs   sessionTotals (fixed), windowTotals (new),
                               latestRateLimitAnchor (new), streamTotals (as-is)
scripts/tests/pipeline.test.mjs         NEW — the suite for all of the above
scripts/tests/fixtures/herdr-stub.mjs   NEW — fake `herdr` binary for tests
.mcp.json                      NEW — browser MCP server only
.claude/hooks/probity-subagent-shim.mjs  SHRUNK — §9.5, sequenced last
docs/adr/0013-probity-direct-shim-not-plugin.md  NEW — §9.5
```

Test seams (env overrides, nothing else):
- `herd.mjs` resolves the herdr binary as `process.env.HERDR_BIN || 'herdr'`.
- `measure.mjs:31` becomes `process.env.CLAUDE_PROJECTS_DIR || join(HOME, '.claude', 'projects')`.
- `conduct.mjs:36-41` CLAUDE resolution: unchanged except a
  `process.env.CONDUCT_CLAUDE_BIN` override in front (tests substitute a stub).
  Pane mode never needs this constant — `agent start --kind claude` launches
  whatever the pane resolves, which is now the real npm install (finding 2).
- `conduct.mjs:637-654` gains an import guard
  (`fileURLToPath(import.meta.url) === process.argv[1]`, same pattern as
  `measure.mjs:192`) and exports `{ STAGES, REVIEWERS, cmds }` plus the helpers
  the tests exercise — without the guard, importing conduct.mjs from a test
  calls `process.exit`.

All herdr and git invocations use `execFile`-family with argv arrays — never a
shell string. The only text that ever reaches a pane's TTY is listed
exhaustively in §10 (Security).

---

## 3. Stage lifecycle in pane mode

### 3.1 Launch — the documented `herdr agent start` recipe

The first design revision worked around a broken `agent start` with
`pane run` + detect + rename; finding 2 removed the reason, so the workaround is
gone — no second independent reason to keep it exists (herdr's launcher now
resolves the same real claude the operator uses, and native argv control comes
via `--`).

```
launchStage({ paneId, label, sessionId, argv, promptPath })   // herd.mjs
  1. readiness: pane process-info → foreground is the shell; if not, wait 2s,
     re-check; still busy → throw PaneNotReady (criterion 36 path)
  2. herdr agent start <label> --kind claude --pane <paneId> --timeout 60000 --
       --session-id <uuid> --agent <agent> --autocompact <compact>
       --permission-mode <bypassPermissions|plan> [--model <m>]
       [--mcp-config .mcp.json] --strict-mcp-config
     - every element is a conductor constant, a generated UUID, or a validated
       identifier/path (§10); labels already satisfy herdr's
       [a-z][a-z0-9_-]{0,31} name rule via checkLabel
     - agent_not_ready (blocked during startup, e.g. a first-run dialog) is not
       failure: the name is live — fall through to watch, which will surface
       blocked and hold (§3.3)
  3. herdr agent get <label> → cross-check agent_session.value == sessionId
     (finding 1 OPEN: if interactive claude rejected --session-id, adopt
     agent_session.value as the stage's session — attribution stays exact
     either way, per finding 5)
  4. herdr agent prompt <label> "Read <promptPath> and do exactly what it says."
```

On step-2/4 failure (including `timeout waiting for agent startup`): **one**
bounded retry after re-running the readiness check; on second failure, print
herdr's error verbatim, fall back to `runClaude` headless for this stage, and
continue the run. Never abort, never skip (criteria 35, 36).

### 3.2 Prompt delivery — always a file (resolves the 2KB question)

The 2KB TUI-paste risk is not mitigated, it is **removed**: pane-mode prompts
are written to `docs/runs/<slug>/prompts/<label>.txt` (gitignored beside
`logs/`) and the only typed text is the one-line sentence in step 4. This is
cheaper (one short line through the TTY), matches the pipeline's paths-never-
contents rule — now proven load-bearing in the read direction too (finding 8) —
and makes criteria 16 and 38 hold by construction: prompt bytes never transit a
TTY or shell. The test asserts (a) the file content equals the intended prompt
exactly, (b) no herdr argv contains any prompt content, (c) a prompt containing
`$(...)`/backticks/newlines produces no side effect and no marker file.
Exception: single-line prompts (the `answer` nudge, `/exit`) go through
`herdr agent prompt` directly — each is a fixed template whose only variable
parts are validated paths.

### 3.3 Watch loop — completion and blocked in one place

```
watch(label, { intervalMs = 60000 })            // herd.mjs
  loop:
    r = herdr agent wait <label> --timeout <intervalMs>
    - settled idle|done      → return { state: 'settled' }
    - settled blocked        → return { state: 'blocked' }
    - timeout (still working)→ loop
    - herdr CLI error        → return { state: 'lost', error }
```

Herdr's own settle logic is the completion authority (criterion 15 — no fixed
sleeps). The bounded `--timeout` per call keeps the conductor responsive to
server death and Ctrl+C; it is not a completion heuristic. There is **no
runaway check** — round 3 deleted the concept: no threshold is defensible, the
5-hour window is the real externally-enforced ceiling, and visibility (this
very pane) is the guard. The conductor then:

- `settled` + `DECISIONS.md` open (existing `decisionsOpen`, conduct.mjs:415)
  → **hold warm**: status `held`, `holdReason:'decisions'`, `gateStage` set,
  agent left alive, notify (§3.5). No `/exit`, no artifact-and-exit.
- `settled`, no gate → finalize (§3.4).
- `blocked` (herdr recognized a permission/question UI — includes the one-time
  interactive bypassPermissions acknowledgement dialog, if this machine has
  never acknowledged it) → status `held`, `holdReason:'blocked-ui'`, notify.
- `lost` → treat as interruption; the resume path (§5) owns it.

### 3.4 Finalize

1. Meter: `sessionTotals(sessionId)` (+ `previousSessions`, §5); if
   `turns === 0`, retry once after 2s (pane transcripts are written live, so
   the headless flush race barely applies — the retry is belt-and-braces);
   record `source:'transcript'` (or `'none'`, printed as `unknown`).
2. `run.stages[label] = { code: 0, status:'done', mode:'pane', session, pane,
   contextTokens, outputTokens, turns, seconds, source }` — `code:0` kept so
   `cmds.next`'s existing `code === 0` scan (conduct.mjs:502) is untouched.
3. Free the process, keep the evidence: `herdr agent prompt <label> "/exit"`,
   wait for the pane to return to a shell (process-info), **leave the pane
   open** — scrollback intact (criterion 15), no idle claude holding RAM on a
   16GB machine (D2's stated concern). The pane returns to the role pool.
4. `afterStage` runs unchanged — `produces` existence check and warning
   (conduct.mjs:432-435) applies identically in both modes. Per finding 8,
   the produced files ARE the stage's output channel; nothing is ever
   collected from the pane.

### 3.5 Notify

`notify(title, body)` in herd.mjs → `herdr notification show <title> --body
<body> --sound request`, best-effort (failure is a console line, never fatal).
Every hold prints, and sends, workspace + pane + agent name so the operator can
attach (criterion 6).

---

## 4. The cockpit and pane topology

Per D2: **skeleton at `conduct start`**, stage panes on demand.

- `ensureCockpit(run)` (idempotent, re-run by `next` if the workspace
  disappeared): `herdr workspace create --cwd <ROOT> --label <slug> --no-focus`
  → root pane becomes the **plan pane**: `pane run` a fixed watch loop
  `while ($true) { cls; node scripts/pipeline/conduct.mjs plan; Start-Sleep 5 }`
  (constant string, zero interpolation); split down --no-focus → **diff pane**:
  same loop shape around `git --no-pager diff --stat <base>...HEAD` where
  `<base>` is validated `/^[0-9a-f]{7,40}$/` before embedding.
  Stored: `run.herdr = { workspace, tab, planPane, diffPane, rolePanes: {} }`.
- **One pane per agent role, reused** (spec ASSUMED, kept): role key =
  `spec.agent` (`product-manager`, `architect`, `ux-designer`, `developer`,
  `ui-designer`, `tester`). `ensureRolePane(run, role, cwd)` reuses
  `rolePanes[role]` when its pane still exists and passes the readiness check
  (§3.1 step 1 — a finished stage left it at a shell after `/exit`); otherwise
  splits a new pane `--no-focus` (`--cwd` = the verify worktree for the tester,
  criterion 21) and records it. Reuse always means a **new** claude process and
  a **new** session id — a role's next stage never re-prompts the previous
  agent (context isolation and per-stage metering, spec ASSUMED).
- Reviewer panes (§7) go in a second tab (`herdr tab create` — exact flags from
  `herdr tab`, printed by the group command) so the main tab keeps readable
  geometry; they follow the same exit-but-leave-open rule.
- Panes never steal focus: every create/split passes `--no-focus`.

---

## 5. Durability — restore, reattach, resume (criteria 1-4)

State is persisted **before** the prompt is sent: `run.stages[label] =
{ status:'running', mode:'pane', session:<uuid>, pane, startedAt }` + saveRun
happens between §3.1 steps 3 and 4. A reboot can therefore never orphan a
running stage invisibly.

`conduct next` (and `plan`) first scans for stages with `status` `running` or
`held` before looking for the next unstarted stage:

- `agentInfo(label)` finds a live agent → **reattach**: print "still in
  progress", re-enter `watch` with the same session id. No new session, no
  second boot (criteria 1, 2). This same path is how a stage the operator
  answered directly in its pane gets its bookkeeping finished.
- Agent gone, pane or workspace gone, but `session` recorded → **restore**:
  `ensureRolePane` + relaunch via §3.1 with native args `--resume <session>`
  instead of `--session-id`, then prompt: "You were interrupted. Re-read
  <promptPath> and continue; work already on disk stands." Same session id in
  run.json before and after (criterion 2). If herdr's own restore already
  brought the pane back (integration ≥v6 behaviour, session identity per
  finding 5), the reattach branch wins and this one never fires.
- `--resume` fails (session unrecoverable) or no session recorded → say so
  explicitly, push the old id onto `previousSessions`, and re-run the stage
  from scratch (criterion 3 — never present partial work as complete).
- Metering across all of the above: stage totals = `sessionTotals(session)` +
  Σ `sessionTotals(previousSessions[i])` — interruption never loses spend
  (criterion 4).

`conduct answer` grows a pane branch: if `gateStage`'s record is a held pane
stage with a live agent → `herdr agent prompt <label>` with the existing
DECISIONS nudge text (conduct.mjs:541-543, path-only, single line) and re-enter
`watch`. Headless records keep today's `--resume` path verbatim (criterion 8).

---

## 6. Metering

### 6.1 Defect 5 — the flush race (criteria 17, 26-29)

Three layers, all through `measure.mjs` (criterion 19 — one code path, both
modes):

1. **`sessionTotals(sessionId)` is rewritten to be session-addressed**: read
   `<projectsDir>/*/<sessionId>.jsonl` plus
   `<projectsDir>/*/<sessionId>/subagents/*.jsonl` directly instead of scanning
   every transcript on the machine (measure.mjs:64-77 currently calls
   `records(0)` — a full-machine scan per stage). RequestId-dedup semantics
   unchanged (criterion 18); subagent records now counted into their parent
   session, matching what the result-object fallback already counted.
2. **Close-time fallback** (`runClaude` close handler, conduct.mjs:288-303): if
   `sessionTotals` returns `turns === 0`, take `streamTotals(logPath)`
   (measure.mjs:94-110, already parses the `result` object the stage streamed)
   and record `source:'result'`; if both empty, `source:'none'`. Zero sleeps,
   run.json non-zero immediately (criterion 26).
3. **Lazy recompute** at `report`/`plan` (criterion 27): `refreshRun(run)` —
   for every stage with a session id and (`source !== 'transcript'` or
   `turns === 0`), recompute from the transcript; if it yields turns > 0,
   persist with `source:'transcript'` so it happens once. Old run.jsons with
   `contextTokens: 0` (the live defect's damage) heal on next `report`.

Rows that genuinely cannot be recovered (`source:'none'`, no session) print
**`unknown`**, never `0` (criterion 28). A zero means measured zero.

### 6.2 No dollars anywhere (criterion 22)

All `$` output dies: `runClaude`'s ok-line (conduct.mjs:306-308), the budget
warning (309-311), `plan`'s per-stage detail and "spent so far" (585, 611-612),
`report`'s cost column and total (618-631). Replacement columns: context /
output / turns / time. The `cost` field already persisted in old run.json
records is left in place (history) but never printed. Test greps every command's
output for `$` adjacent to a digit and fails on any.

### 6.3 Window-aware metering (criteria 23-25, 41)

New in `measure.mjs`:

- `latestRateLimitAnchor(runsDir)` — scan `docs/runs/*/logs/*.jsonl` newest-
  mtime-first for the last `rate_limit_event`; return
  `{ resetsAtMs, rateLimitType }` or `null`. Reads only `rate_limit_info`
  fields (finding 3: this is the only place the event exists).
- `windowTotals({ anchorResetMs })` — one pass over machine-wide transcripts
  (mtime ≥ now-7d prefilter, now including `*/subagents/*.jsonl` — finding 4:
  that spend is real), requestId-deduped, bucketed into the 5-hour window and
  the trailing 7 days. Returns **numbers only**: `{ window: { ctx, out, turns,
  sessions, anchored, resetsAtMs|null }, week: { ctx, out, turns, sessions } }`
  — no session id, path, or content field exists on the return value
  (criterion 41 by type).

`conduct report` renders, machine-wide:

```
  5h window (resets 14:00, in 1h12m)   ctx 3.4M   out 45k   calls 122
  5h window (trailing — no anchor)     ...                       ← unanchored variant, labelled
  7-day rolling                        ctx 41.2M  out 512k
```

Anchored iff `resetsAtMs > now`; else the trailing label (spec ASSUMED). Never a
percentage, "remaining", or headroom — there is no quota figure to derive one
from (criterion 24; the test fails on `%` next to the window figures).
Advisory: `RESET_ADVISORY_MIN = 15` (constant beside STAGES); at stage start,
if anchored and `resetsAt - now ≤ 15min`, print "window resets at <t> (in Nm) —
starting anyway" and **start** (criterion 25 — never auto-halt). The window is
also the only spend ceiling there is, by owner ruling (round 3).

---

## 7. The review stage under pane mode (criteria 9, 10)

Placement is constraint-driven, accepted by the owner in round 3 ("a property
of the tools, not a design choice"):

- **conformance** (architect, ordinary prompt) — pane agent, file prompt.
- **ponytail** — pane agent; its prompt file instructs invoking the
  `ponytail:ponytail-review` **skill** (plugin skills are Skill-tool-reachable,
  so the file-prompt rule holds; skill availability inside panes is finding 9).
- **security** — stays a headless `-p "/security-review ..."` child in ALL
  modes: `security-review` is compiled into the CLI, unreachable by the Skill
  tool, and no pane-safe delivery can fire a built-in slash command reliably.
- **codex** — child process, unchanged (`runCodex`, conduct.mjs:369) — spec
  out-of-scope.

`runReviews` (conduct.mjs:398-411) keeps its `Promise.all` shape; pane watch
loops are async (herdr calls via promisified `execFile`, never `execFileSync`,
so concurrent watches interleave). Concurrency is preserved by construction
(criterion 9 — the test asserts all reviewer starts are issued before any
completion is consumed, via stub call ordering); token parity is criterion 10's
live-run check. A reviewer that holds resolves its promise as `held` without
stalling the others (criterion 6); the review stage stays incomplete until it
finishes.

Build tasks stay strictly sequential in both modes (criterion 11): `runBuild`'s
for-loop shape is untouched, and the test asserts the second task's session
starts only after the first's completes (stub timeline ordering) — a
concurrency regression fails it.

---

## 8. Mode selection and the headless fallback (criteria 33-36)

```
paneMode(flags) = !flags.noPanes && herdrAvailable()   // `herdr workspace list`, 3s timeout
```

- Herdr present, no flags → panes engage automatically (criterion 33).
- `--no-panes` (accepted by `start`, `next`, `run`, `answer`, `fix`) → today's
  headless path, byte-identical artifacts, §6.1 fixes excepted (criterion 34).
  Per-invocation, not persisted.
- Herdr absent/down → one line naming the reason, headless, run completes
  (criterion 35). `runClaude` and every gate keep working exactly as today —
  pane mode is additive.
- Per-stage launch failure → §3.1's retry-then-fallback with herdr's error
  verbatim (criterion 36).

---

## 9. Two knobs made honest

### 9.1 The MCP knob (criteria 30-32)

- **`.mcp.json`** (repo root, committed): exactly one server —
  `{ "mcpServers": { "playwright": { "command": "npx",
  "args": ["@playwright/mcp"] } } }`. Browser only; Sanity deliberately absent
  (criterion 31 — the test parses the file and fails if any server other than
  the browser one appears).
- **`@playwright/mcp`** added to `devDependencies` (package.json). The repo
  already ships Playwright E2E, so browsers are present; a pinned local install
  makes availability deterministic and offline.
- `claudeArgs` (conduct.mjs:244-257): `mcp: true` stages get
  `--mcp-config .mcp.json --strict-mcp-config` (exactly this file's servers,
  nothing inherited); all other stages keep bare `--strict-mcp-config` (no
  config → no servers loaded, criterion 31). Same argv in pane mode (§3.1).
- Preflight: before an `mcp: true` stage, `existsSync('node_modules/@playwright/mcp')`;
  missing → print "browser MCP unavailable (<reason>) — running the stage
  without it" and run anyway (criterion 32). The test stubs the path away and
  asserts the warning + the stage still runs.

### 9.5 The Probity shim, shrunk — and the ADR (round 3, new scope)

`.claude/hooks/probity-subagent-shim.mjs` does two jobs; only one is a
workaround, and this feature makes it dead code:

- **Delete job 1** — the subagent transcript rewrite: the header's problem
  statement, `findSubagentTranscript` (lines 27-53) and the `agent_id` branch
  (lines 66-69). It exists solely because v1 ran the developer as a subagent;
  under this feature every stage is a top-level session and `agent_id` never
  appears in a hook payload.
- **Keep job 2** — direct `node node_modules/@nizos/probity/dist/bin.js`
  invocation (an improvement over the plugin's per-tool-call `npx`), the
  fail-closed deny when no candidate root has probity, and — **do not
  regress** — the multi-candidate root resolution (lines 71-91:
  `payload.cwd` → `CLAUDE_PROJECT_DIR` → `process.cwd()`), which exists
  because Claude Code reports POSIX cwd paths after a `cd` and resolving from
  `payload.cwd` alone denied every write in a session.
- **`probity@probity` stays disabled** — enabling it beside the shim would
  double-gate every write, and its `npx` path is the worse invocation.
- **ADR `docs/adr/0013-probity-direct-shim-not-plugin.md`** (next after 0012)
  records: why the plugin is disabled (npx resolution on every Bash/Write/Edit
  call; shell-spawned npx as needless attack surface), why enabling both would
  double-gate, and that the subagent-transcript half was removed when pipeline
  stages became top-level sessions (this feature).

**SEQUENCING IS LOAD-BEARING.** This feature is itself being built by the v1
pipeline, whose developer IS a subagent — removing job 1 early would disable
the TDD gate for the build in progress. The shim task is t9, `after: ["t8"]`,
strictly last. Within t9 the order is: test first, ADR second, **the shim edit
last**, then the (ungated) `04-build.md` note — because the moment the shim
shrinks, the very session editing it loses the subagent rewrite for its own
subsequent gated writes.

---

## 10. Security

No customer data, no financial PII, no authenticated endpoint — but two real
surfaces, per the spec §I. House guardrail: input validation at trust
boundaries is never the lazy option.

**I1 — command construction.** Trust boundary: conductor → herdr CLI →
PowerShell inside panes. Rules, each with a test:

- **Slug** validated by `checkSlug` (conduct.mjs:48-49) as the *first statement*
  of `cmds.start` — before `mkdirSync`, before `.active`, before any git/herdr
  call (today it is only applied at conduct.mjs:521; criterion 37's test drives
  a bad slug through `start` and asserts exit ≠ 0, no directory anywhere, no
  `.active`, no spawned process).
- **Labels/identifiers**: everything that becomes an agent name, pane label, or
  prompt filename passes `checkLabel` = `/^[a-z][a-z0-9_-]{0,31}$/` — stage ids
  are constants, but task ids from `02-tasks.json` and therefore `build-<id>`
  labels are run-derived and are validated where read (`runBuild`,
  conduct.mjs:322-327); `fix-<n>` is conductor-generated (criterion 39).
- **No prompt content ever transits a shell or TTY** (§3.2). The exhaustive
  list of strings typed into panes: (a) the fixed plan/diff watch-loop
  commands, whose only variable is the `/^[0-9a-f]{7,40}$/`-validated base
  commit; (b) the one-line "Read <path>..." prompts and `/exit`, whose only
  variable is `docs/runs/<checkSlug>/prompts/<checkLabel>.txt`. The claude
  launch itself goes through `herdr agent start` argv (execFile array), never
  through a shell string the conductor composes. Criterion 38's test routes a
  `$(...)`-laden prompt through the stub flow and asserts no marker file and
  no prompt bytes in any recorded argv.
- All herdr/git/claude invocations are argv arrays via `execFile`/`spawn` — the
  existing no-shell property (conduct.mjs:33-35 comment) is preserved and now
  also asserted by test.

**I2 — transcript reading.** Metering now reads transcripts **machine-wide**,
including other projects' sessions, which may contain secrets those sessions
read. Containment:

- `windowTotals` and `sessionTotals` extract only `usage`, `requestId`, `uuid`,
  `sessionId`, `timestamp`, `cwd` (filter only), `isSidechain`, and
  `rate_limit_info` fields; return values are numbers/booleans only. Nothing
  from `message.content` is ever read into a variable that escapes the parse
  loop (criterion 40).
- Cross-project aggregation surfaces **counts only** — no session id, project
  path, or filename in any output or in run.json (criterion 41; test seeds a
  foreign-project stub transcript containing a marker string and asserts the
  marker appears in no output and no written file).
- Per-stage metering is **session-addressed by recorded id** (§6.1) — no
  newest-transcript guessing while concurrent sessions exist (criterion 42, by
  construction).
- Prompt files under `docs/runs/*/prompts/` contain only stage-template text +
  repo paths (same content as today's `-p` arguments); gitignored with `logs/`.

---

## 11. STAGES / run.json deltas (exact)

`STAGES` (conduct.mjs:56-193) and `REVIEWERS` (196-218):
- `budget: <usd>` fields **deleted** on every entry, along with
  `--max-budget-usd` in `claudeArgs` (line 251), the `overBudget` computation
  (line 302) and its warning (309-311). No replacement — round 3: no runaway
  mechanism under any name. The comment block at 51-54 records the owner's
  rationale so nobody re-proposes a guard.
- No other stage fields, prompts, order, gates, or `compact` values change.
- New constants beside the table: `RESET_ADVISORY_MIN = 15`,
  `LABEL = /^[a-z][a-z0-9_-]{0,31}$/`.

`run.json`:
- per-stage: add `status`, `mode`, `pane`, `source`, `holdReason`,
  `previousSessions` (all optional; absent in old records ⇒ read as
  done/headless — `code` keeps its meaning, nothing existing breaks).
- run-level: add `herdr` (§4). `--no-panes` is **not** persisted (a
  per-invocation flag, criterion 34's wording).

`.gitignore`: add `docs/runs/*/prompts/` beside the existing
`docs/runs/*/logs/` (line 58).

`package.json`: add `"test:pipeline": "node --test scripts/tests/pipeline.test.mjs"`
and append `scripts/tests/pipeline.test.mjs` to the `test:pure` list (line 17);
add `@playwright/mcp` to devDependencies.

---

## 12. Sequencing and test plan

Tasks are in `02-tasks.json` (t1→t9, sequential; each may read `04-build.md`).
Build order rationale: metering first (t1-t2, self-contained, heals the live
defect even if everything else stalls), MCP next (t3, independent), the herdr
adapter (t4) before everything that uses it (t5-t7), docs (t8), and the probity
shim strictly last (t9 — §9.5's load-bearing sequencing).

**One suite: `scripts/tests/pipeline.test.mjs`** (wired as `test:pipeline` and
into `test:pure`), stubbing:
- herdr via `HERDR_BIN` → `scripts/tests/fixtures/herdr-stub.mjs` (records argv
  to a per-test file; replies canned JSON from an env-named fixture dir);
- claude via `CONDUCT_CLAUDE_BIN` → a script emitting a canned stream-json log;
- transcripts via `CLAUDE_PROJECTS_DIR` → temp dirs the tests seed.

Criterion → test mapping (the tester's checklist):
| criteria | proof |
|---|---|
| 17, 26, 28, 29 | seeded transcript + result-log fixtures; run.json non-zero; `unknown` row; both modes |
| 18 | fixture with N records over M requestIds; naive sum fails |
| 19, 20, 21, 42 | same `sessionTotals` path both modes; two concurrent sessions attributed separately; worktree-cwd session found by id |
| 22 | no `$`-digit in `report`/`plan`/stage-line output |
| 23, 24, 41 | windowTotals buckets; anchored vs trailing label; no `%`; foreign-project marker never surfaces |
| 25 | advisory printed, stage still starts |
| 27 | zero-token run.json heals on `report`, persists once |
| 30, 31 | `.mcp.json` parsed: browser server only; argv assertions per mcp flag |
| 32 | missing package ⇒ warning + stage runs |
| 5-8 | stub-driven hold: settled+DECISIONS ⇒ held, agent alive, `answer` prompts same session; headless gate unchanged |
| 9, 11 | reviewer starts all issued before any completion consumed; build tasks provably serial |
| 12, 13, 15 | cockpit calls on start; agent named by label before "started" reported; watch loop, no sleeps; produces-warning fires |
| 14 | **OPEN GAP — not covered, not descoped.** See below. |
| 16, 38 | prompt file byte-equal; no prompt bytes in argv; `$(...)` inert |
| 33-36 | auto-engage / `--no-panes` / herdr-down one-liner / retry-then-fallback with verbatim error |
| 1-4 | reattach on `status:'running'`; restore passes `--resume <sid>`; unrecoverable ⇒ explicit re-run; previousSessions summed |
| 37, 39 | bad slug: exit ≠ 0, nothing created; bad task id rejected at `runBuild` |
| §9.5 shim | payload without `agent_id` forwarded byte-identical; missing probity ⇒ fail-closed deny; POSIX-cwd payload still resolves the bin |

**Criterion 14 — OPEN GAP, unmet and visible (owner ruling, `DECISIONS.md`
round 4, 2026-08-27).** The criterion asks that `herdr agent read <label>`
return a running stage's live output. It cannot today, and the measurement is
why: herdr answers `agent_not_idle` while an agent is working, and Claude runs
on the terminal's **alternate screen**, so rows that scroll off never enter
herdr's host scrollback and are unrecoverable at any `--lines`. Reproduced
repeatedly, including losing part of a probe agent's own reply.

An earlier revision of this table discharged 14 by citing its own negation —
"no `agent read` in any data path" — which answers a criterion by inverting it.
**That reasoning is withdrawn.** The no-pane-reads rule (stub hard-fails if any
data path calls `agent read`) is a real constraint this design meets, but it is
a *consequence* of the gap, not evidence against it, and it discharges nothing.
Do not close 14 by redefining it, and do not let a future acceptance pass
silently reclassify it as out of scope.

What is and is not blocked: the owner can **see** a running stage by looking at
its pane — that part works. What is impossible is the **conductor** reading it
programmatically. Any future solution lives in that gap, e.g. a stage streaming
its own progress to a file the conductor can tail.

**Live evidence (spec ASSUMED, tester's job at verify):** one real stage in a
pane and one interrupt-and-resume, recorded in `06-verify.md`. Unblocked —
finding 2 verified `agent start` end to end. t4's `04-build.md` entry must
resolve the one remaining OPEN item (interactive `--session-id`; on rejection,
adopt `agent_session.value`).

---

## 13. Rejected alternatives

- **`pane run` + detect + rename as the launch mechanism** — this design's own
  first revision, built when `agent start` failed. The failure was the claude
  binary being installed inside the desktop app's MSIX container (finding 2),
  not a herdr defect; with claude in the real prefix the documented recipe
  works and is fewer moving parts. No second independent reason to keep the
  workaround existed, so it is gone.
- **Typing full prompts into the TUI** (bracketed paste): unfalsifiable
  reliability at 2KB+, and strictly more expensive than a path. Removed rather
  than mitigated (§3.2).
- **Collecting any stage output via `agent read`**: alternate-screen scrollback
  loss and idle-read truncation make it structurally lossy (finding 8).
  Files-and-transcripts only; `agent read` is a human diagnostic.
- **Any runaway guard (dollar, token, or turn)** — owner-deleted in round 3:
  no defensible threshold exists, the 5-hour window is the real ceiling, and
  pane visibility is the replacement. Do not reintroduce `--max-budget-usd`
  under another name.
- **A second accounting mechanism for pane mode** (e.g. asking herdr):
  transcript + requestId dedup is the single source of truth; criterion 19
  demands one path.
- **All four reviewers as pane agents**: `/security-review` is CLI-built-in and
  cannot be delivered reliably except as headless `-p`; codex is spec'd out.
  Accepted by the owner (round 3).
- **Enabling `probity@probity` alongside the shim**: double-gates every write
  and reintroduces per-tool-call `npx` — the ADR (§9.5) exists precisely so
  this is not "fixed" back.
- **Parallel build tasks**: rejected in the grill on token cost; criterion 11
  pins it with a test.
- **A pane per stage, never reused**: ~13 live idle claude processes by run end
  on a 16GB machine; role-pane reuse with `/exit` keeps scrollback and frees
  RAM (spec ASSUMED, D2).

`CONTEXT.md` is deliberately untouched: the pipeline operator is a workshop
role, not a domain actor (spec §1), and no product-domain term is added or
sharpened. `docs/pipeline/v1-backup/RESTORE.md` stays valid — nothing under
`.claude/agents/` changes.

---

## 14. Decisions

None outstanding. Rounds 1-3 in `DECISIONS.md` resolved everything this design
depends on: runaway deleted (round 3), reviewer placement accepted (round 3),
pane-visible claude fixed by the real-prefix npm install (round 3 preamble —
the design's earlier item 3), cockpit skeleton + on-demand panes (round 2).
