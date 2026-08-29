# 06 — Verification: run the pipeline natively on herdr

**Verdict: FAIL.** 35 of 42 acceptance criteria pass, **5 fail**, **2 are
unverifiable without a live run**. Nothing in the metering core is wrong — the
part this feature exists to make honest is the part that holds up best, and it
holds up against real transcripts, not just fixtures. The failures are at the
edges: one command crashes, one criterion was answered by inverting it, one
identifier boundary is missing a check, one operator surface contradicts a
criterion, and one metering path drops the tokens a warm answer spends.

Verified in an isolated worktree at `E:/Projects/herdr-verify`, detached at
`8808555d`. The tree was left byte-clean (`git status --porcelain` empty);
every mutation below was reverted with `git checkout --`.

---

## 1. Gates — the real numbers

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck:gate` | **exit 0** — `✓ no fatal type errors (54 non-fatal remain)` (TS2339 ×47, TS2322 ×4, TS2345 ×3). Matches the known pre-existing baseline; no new fatal errors. |
| Owning suite | `npm run test:pipeline` | **exit 0 — 57/57 pass**, 20.7s. The build log's "57/57" claim reproduces exactly. |
| Full battery | `npm test` | **exit 1** — `typecheck:gate` ✓, `test:pure` **832 pass / 1 fail** of 833, `test:heavy` never ran (the `&&` chain stopped on the failure). |
| Heavy suite | `npm run test:heavy` (run separately) | **exit 0 — 302/302 pass**. |

### The one `npm test` failure is not this feature

```
scripts/tests/certified-removal.test.mjs:763
✖ the age gate catches the real archive first, because it is 2026-07 vintage
  expected: /h old/
```

The test asserts `sanity/sanity-production-before-import.tar.gz` is ~854 hours
old. `git worktree add` writes the file fresh, so its mtime is the checkout
time and the age gate does not fire. Proven environmental:

```bash
touch -t 202607200821 sanity/sanity-production-before-import.tar.gz
node --test scripts/tests/certified-removal.test.mjs
# ℹ tests 34  ℹ pass 34  ℹ fail 0
```

`git log 6a5668d2..HEAD -- scripts/tests/certified-removal.test.mjs` is empty —
the feature never touched it. **Not a finding against this work**, but it does
mean `npm test` is red for any tester working in a worktree, which is where
this repo's own house rule sends them.

---

## 2. The metering core — checked against reality, not fixtures

This is the part of the feature that had to be right, so it got checked
hardest, and it is right.

### requestId dedupe (criterion 18) — verified against a real transcript

An independent counter written from scratch (not sharing a line with
`measure.mjs`) was run over the real session `378e86ec-…` on this machine:

```
{"files":1,"records":26,"distinctRequestIds":10,
 "naiveCtx":1453670,"naiveOut":47373,
 "dedupedCtx":556185,"dedupedOut":16933,"ratio":2.61}
```

`sessionTotals('378e86ec-…')` returns `{"ctx":556185,"out":16933,"turns":10}` —
identical to the independent deduped count, and identical to what
`docs/runs/smoke-test/run.json` recorded. The 2.6× overcount is real, it is
avoided, and the avoidance is not self-referential.

Second real session `a3caa593-…`: 7 records → 3 requestIds, naive 248,461 vs
deduped 110,499 (2.25×). `sessionTotals` returns 110,499 / 3,718 / 3. ✓

### Mutation testing — every guard was broken on purpose

The build log admits several tests were "green on arrival". Each load-bearing
guard was mutated and the suite re-run. All of them go red.

| # | Mutation | Result |
|---|---|---|
| M1 | Build tasks started concurrently (no `Promise.*`, so the source-read guard cannot fire) **and** the `after` gate removed | ✖ `AssertionError: t2 started before t1 was finished with - build tasks were made concurrent` — **the behavioural assertion itself catches it**, not the banned-word scan |
| M2 | `seen.has(key) continue` removed from `sessionTotals` | ✖ **9 tests red** |
| M2b | Same dedupe removed from `windowTotals` | ✖ 1 test red |
| M3 | `metered()` forced to `true` (so `unknown` collapses to `0`) | ✖ `report heals a zero-token stage … and prints unknown for the unrecoverable` |
| M4 | `$12.34` appended to `report`'s TOTAL row | ✖ `no conductor output contains a dollar figure` |
| M5 | Foreign session ids and a foreign-project list leaked out of `windowTotals` | ✖ `windowTotals reports counts only: nothing from another project escapes it` |
| M6 | `87% of quota` / `13% remaining` rendered beside the window rows | ✖ 2 tests red |
| MA | `stageSum` stops summing `previousSessions` | ✖ 3 tests red — including the "green on arrival" worktree test |
| MB | `sessionFiles` scan-and-guesses the newest transcript (criterion 42) | ✖ 5 tests red — including the "green on arrival" worktree test |
| MC | The prompt **body** typed into the pane instead of its path | ✖ 5 tests red |
| MD | `watch()` settles on `unknown` | ✖ 2 tests red |
| ME | The reattach branch removed | ✖ 2 tests red |
| MF | `answer` re-boots instead of prompting the live agent | ✖ 3 tests red |

**The two tests the build log flagged as green-on-arrival that I re-checked
(`a tester session in the verify worktree…`, criterion 21; and the durability
sums) are genuinely load-bearing** — MA and MB both kill them.

### Live output, real data

```
$ node scripts/pipeline/conduct.mjs report      # .active = smoke-test

  smoke-test - 2 stage runs

  stage                   context   output  turns    time
  -------------------------------------------------------
  spec                       110k       4k      3     67s
  design                     556k      17k     10    368s
  -------------------------------------------------------
  TOTAL                      667k      21k

  machine-wide, all Claude sessions:
  5h window (trailing - no reset seen)  ctx 75.2M    out 98k      512 calls
  7-day rolling                         ctx 4.09B    out 4.5M     11515 calls

  conductor overhead: 0 tokens - this script is not a model.
```

No dollar figure. No percentage, no "remaining", no headroom. No session id, no
project path, no file name, no message content — the machine-wide rows are
counts only, and this scan really did read other projects' transcripts.

### MCP — verified live, not asserted

```
$ claude -p "reply with only: OK" --output-format stream-json --verbose \
    --mcp-config .mcp.json --strict-mcp-config --permission-mode plan
mcp_servers: [{"name":"playwright","status":"connected"}]
mcp tool count: 24        # mcp__playwright__browser_click, …

$ claude -p "…" --strict-mcp-config --permission-mode plan   # no --mcp-config
mcp_servers: []
mcp tool count: 0
```

Per-stage argv (`claudeArgs(spec, 'X', true)`): `ux` and `polish` get
`--mcp-config .mcp.json`; `spec`, `design`, `build`, `verify`, `accept` get
`--strict-mcp-config` and nothing else. Sanity is absent from `.mcp.json`. ✓

---

## 3. Findings

### F1 — `conduct answer` crashes on any held `build-*` or `review-*` stage, and loses the finished task — CONFIRMED

`scripts/pipeline/conduct.mjs:986` uses `STAGES.find((s) => s.id === id)`.
`run.gateStage` is set by `holdWarm` (`conduct.mjs:511`) to *whatever label
held*, which includes `build-t1` and `review-ponytail`. `stageSpec(label)`
(`conduct.mjs:750`) exists for exactly this and is used by `cmds.resume` — but
not by `cmds.answer`.

Pane branch (the normal path, since pane mode auto-engages):

```
$ node scripts/pipeline/conduct.mjs answer
  answering build-t1 in its pane - same session, nothing re-booted
  ok build-t1  ctx 2k  out 20  2 calls  51776s

  TypeError: Cannot read properties of undefined (reading 'gate')
    at afterStage (conduct.mjs:782:12)
    at Object.answer (conduct.mjs:1003:33)
```

Headless branch (`--no-panes`, or herdr down):

```
$ node scripts/pipeline/conduct.mjs answer --no-panes
  resuming build-t1 warm with your answers (no re-boot)

  TypeError: Cannot read properties of undefined (reading 'compact')
    at run.gateStage (conduct.mjs:1013:38)
```

**The worse half is silent.** After the pane-branch crash, `run.json` holds:

```json
"tasksDone": []
"build-t1": { "status":"done", "code":0, "contextTokens":2000, "turns":2 }
```

The task finished, was metered, and is **not in `tasksDone`** — so the next
`conduct run build` runs t1 again from scratch. That is a whole wasted
developer session, which is the exact cost this feature exists to remove.
`cmds.resume` has a `finished()` helper (`conduct.mjs:939-947`) that records
this; `cmds.answer` has no equivalent.

Reproduce:

```bash
SC=$(mktemp -d); mkdir -p $SC/scripts/pipeline $SC/docs/runs/demo $SC/proj/p1
cp E:/Projects/herdr-verify/scripts/pipeline/*.mjs $SC/scripts/pipeline/
cd $SC && echo demo > docs/runs/.active
cat > docs/runs/demo/run.json <<'EOF'
{ "slug":"demo","base":"abc1234","branch":"b","ui":false,"gateStage":"build-t1",
  "stages":{"build-t1":{"status":"held","mode":"pane","session":"sess-b1",
    "pane":"w1:p3","holdReason":"decisions","source":"none",
    "startedAt":"2026-08-26T00:00:00.000Z"}},"tasksDone":[] }
EOF
printf '# q\n\n1. something?\n' > docs/runs/demo/DECISIONS.md
CLAUDE_PROJECTS_DIR=$SC/proj node scripts/pipeline/conduct.mjs answer --no-panes
```

Criteria: **7** (the block-and-answer cycle does not complete), and the
`tasksDone` loss defeats the point of **11**.
Failing test to write: `conduct answer` on a held `build-t1` exits 0 and leaves
`tasksDone: ['t1']`.

---

### F2 — `conduct plan` shows an interrupted stage as not-started — CONFIRMED

Criterion 1 requires: *"`conduct` reports that stage as still in progress rather
than as failed or **not-started**."*

```
$ node scripts/pipeline/conduct.mjs plan      # design is status:'running', mode:'pane'

  STAGES
  [x] spec     ctx 3k  3 calls  10s
  [ ] design
  [ ] build
  [ ] verify
```

`design` — mid-work, with a live session id in `run.json` — renders identically
to `build`, `verify` and `accept`, which have never been started.
`conduct.mjs:1050` computes `done = s?.code === 0` and `mark()`
(`conduct.mjs:1043`) has a `'run'` → `'[>]'` branch that **nothing ever
passes**. Dead flexibility, and the case it was written for is the one that
fails.

This matters more than a display nit: `ensureCockpit` (`herd.mjs:118`) runs
`conduct plan` on a 5-second loop in the run's own plan pane. It is *the*
surface the operator watches, and after a reboot it says the stage never began.

`04-build.md` t7 records this as "**Not done**: `plan` does not show a running
stage — design §5 wants it there too; it is display-only and **no criterion
asked for it**." Criterion 1 asked for it.

Criterion: **1**. Failing test to write: a run with a `status:'running'` stage
renders `[>]`, not `[ ]`.

---

### F3 — criterion 14 is not met, and was answered by inverting it — CONFIRMED

Criterion 14: *"when the operator runs `herdr agent read <label>`, then that
stage's live output is returned and herdr reports its state as `working`."*

`02-design.md:73` records the opposite, measured: *"`herdr agent read` returns
`agent_not_idle` while an agent works"*, and Claude draws on the alternate
screen so scrollback is lost. `herd.mjs:7-13` states `agent read` "appears
nowhere below", and `scripts/tests/pipeline.test.mjs:795` (`no herd.mjs path
reads a pane`) enforces that with a stub that hard-fails if it is ever called.

The design's traceability table (`02-design.md:587`) lists criteria **12-15**
together and discharges 14 with *"no `agent read` in any data path (stub asserts
it is never called)"* — which is the negation of what 14 asks for. A criterion
that turned out to be unachievable is an owner descope decision, not something
a traceability row absorbs.

Criterion: **14**. No code fix; this needs the criterion amended or dropped by
the PM/owner with the measured reason attached.

---

### F4 — `writePrompt` lets an unvalidated slug escape `docs/runs/` — CONFIRMED

`herd.mjs:130` validates the **label** (`checkLabel`) and not the **slug**,
though `checkSlug` is defined ten lines above it (`herd.mjs:58`) and used by
`ensureCockpit`. The module's own header (`herd.mjs:17-19`) claims every
variable part reaching a pane is "a validated label, a validated path, or a
validated commit sha". The path is half-validated.

```
$ node -e "…writePrompt(root, '../../../ESCAPED', 'spec', 'payload')"
returned rel path: docs/runs/../../../ESCAPED/prompts/spec.txt
# file written at:  <scratch>/ESCAPED/prompts/spec.txt   — three levels outside root
```

That same string is then handed to herdr:
`agent prompt <label> "Read docs/runs/<slug>/prompts/<label>.txt and do exactly
what it says."` (`herd.mjs:195`).

Criterion 39: *"no unvalidated run or task field reaches a herdr command."*
`run.slug` is a run field, it is unvalidated at this boundary, and it reaches
one. Exploitability is low — `execFileSync` with an argv array, no shell, and
`cmds.start` validates the slug on creation — but the threat model
`herd.mjs:48-49` writes down for itself is *"a hand-edited run.json"*, which is
precisely what defeats this. The fix is one call.

Criterion: **39**. Failing test to write: `writePrompt(root, '../../evil', …)`
throws, and writes nothing outside `<root>/docs/runs/`.

---

### F5 — tokens spent by `conduct answer` are dropped once a stage is transcript-metered — CONFIRMED

`refreshRun` (`conduct.mjs:283`) skips any stage where
`source === 'transcript' && turns > 0`, by design ("the recompute happens
once"). The headless `conduct answer` branch (`conduct.mjs:1006-1018`) resumes
that same session with `--resume`, spends real tokens, and then records
**nothing** — no log, no `run.stages` update. The two together lose the spend.

```
transcript truth now: {"ctx":5000,"out":50,"turns":5}

$ node scripts/pipeline/conduct.mjs report
  spec                         3k       30      3     10s      <- still 3 calls
```

Reproduce: seed a session with 3 requestIds, record it in `run.json` as
`source:'transcript', turns:3`, run `report` (heals/persists), append 2 more
requestIds to the same transcript, run `report` again — the figures do not move.

Whether it bites depends on ordering: if the operator runs `plan` or `report`
between the gate and the answer, the stage flips to `source:'transcript'` and
the answer's turns are lost permanently. In pane mode the same path is safe,
because `finalizePane` re-runs `stageSum`. So the two modes disagree about what
a stage cost.

Criterion: **29** (headless end-to-end must show *real* per-stage numbers), in
tension with **27**'s "recompute happens once".
Failing test to write: a transcript that grows after a heal is re-summed by
`report` for a stage that is still the gate stage.

---

### F6 — an `unknown` row is unreadable — CONFIRMED, low

```
  design                  unknown  unknownunknown      0s
```

`conduct.mjs:1097` pads with `'unknown'.padStart(9)` and `.padStart(7)`;
`'unknown'` is exactly 7 characters, so the last column gets no separator. The
one row whose whole purpose is to be noticed is the one that renders as a run-on
word. Criterion 28 is satisfied in substance (it says `unknown`, not `0`) — this
is legibility only.

---

### Observations (not criterion failures)

- **`scripts/pipeline/ab-compare.mjs`, on this branch, prints USD columns**
  (`usd(a.total?.cost)`, lines 80 and 120), and `measure.mjs:179` still carries
  `cost: last.total_cost_usd`. Criterion 22 scopes to *conductor* output, and
  `conduct.mjs` is clean, so this is not a failure — but the owner reading an
  A/B table will see dollars the conductor deliberately refuses to show.
- **`launchStage`'s `adopted` flag is written and never read.** `herd.mjs:186`
  computes it, returns it in `{ session, adopted }` and passes it as
  `onSession`'s second argument; `runPaneStage` (`conduct.mjs:601`) takes one
  parameter and ignores it. Only the tests consume it. Same shape as
  `selected_candidate_id` — worth deleting or wiring.
- **`rolePane` has a fan-out race.** Two reviewers sharing an agent role would
  each see `panes[role]` undefined, each `splitPane`, and the second `saveRun`
  would orphan the first pane. Unreachable with the current `REVIEWERS` table
  (only `conformance` carries an agent) — latent, not live.
- **No test distinguishes `review-codex`'s `0` from `unknown`.** The code is
  right (`source: 'codex'` → `metered()` true → prints `0`, `conduct.mjs:696`),
  and it is a genuinely different state from an unmetered stage. It is the one
  half of the "a zero must mean measured zero" rule with no guard on it.

---

## 4. Coverage gap: live pane execution is still unproven

**Everything in sections A, B, D and H is stub-proven only.** No herdr agent has
ever been started by this code against the real CLI, end to end.

The blocker reproduces exactly as `04-build.md` t4 describes:

```powershell
where.exe claude
  C:\Users\…\AppData\Roaming\npm\claude       <- extensionless npm shim, first
  C:\Users\…\AppData\Roaming\npm\claude.cmd

Start-Process -FilePath claude     -> FAILED: %1 is not a valid Win32 application.
Start-Process -FilePath claude.cmd -> 2.1.232 (Claude Code), exit=0
```

herdr 0.8.2 launches agents with `Start-Process -FilePath claude`, so every
`herdr agent start … -- <native args>` times out and pane mode falls back to
headless. The `claude.cmd` forwarder is in place and **correctly ordered** —
persisted User PATH index 0 (`%LOCALAPPDATA%\Programs\claude-shim`, containing
`claude.cmd`) ahead of `AppData\Roaming\npm` at index 6 — but the herdr server
has not been restarted, so it is not yet in effect. Per instruction, I did not
restart it; the owner is using it.

herdr itself is up and the conductor detects it
(`herd.mjs available()` → `true`, `herdr workspace list` answers), so criterion
33's precondition is real. What that leaves unproven:

- criterion **1** — that herdr's claude-integration v8 actually restores a pane
  and its session across a reboot;
- criteria **5, 6, 13, 14, 15** — that herdr's real lifecycle states
  (`working` / `blocked` / `idle`) arrive as the stub models them;
- criterion **9**'s wall-clock claim (≤ half the sum of reviewer durations);
- criterion **16** end to end — the prompt-file mechanism is byte-proven in
  isolation, but no real agent has read one;
- criterion **36** — the retry-then-fallback path against a real
  `timeout waiting for agent startup`;
- whether an interactive `claude --session-id <uuid>` boot keeps the id or
  whether the `agent_session.value` adoption path is the live one.

The spec's own ASSUMED in §4 requires "a live end-to-end run of one real stage
in a pane and one real interrupt-and-resume, recorded as evidence." **That
evidence does not exist and cannot be produced until the herdr server is
restarted.** Do not read this report as covering it.

---

## 5. Criterion-by-criterion

Legend: **PASS** / **FAIL** / **N-V** (not verifiable here — stated with why).
"stub" = herdr replaced by `scripts/tests/fixtures/herdr-stub.mjs`.

### A. Durability

| # | Verdict | Evidence |
|---|---|---|
| 1 | **FAIL** | `conduct next` does say `> spec is still in progress - reattaching to session …` and `report` renders a row. But `conduct plan` — the cockpit's own 5s-loop pane — prints `[ ]`, the not-started mark the criterion forbids. **F2**. Herdr's own restore-across-reboot half is **N-V** (§4). |
| 2 | PASS | `conduct next reattaches to a stage still in progress - same session, no second boot` — 0 `agent start` calls, same session id, only `/exit` typed. Mutation **ME** kills it. Live: N-V. |
| 3 | PASS | `an unrecoverable session is said out loud, kept in previousSessions, and re-run from scratch` — asserts the words UNRECOVERABLE and FROM THE START, `--session-id` not `--resume`. |
| 4 | PASS | `a restored stage totals the sessions the interruption killed as well as its own` (2+3 sessions → 5 calls); `report heals an interrupted stage to the sum`. Mutation **MA** (3 red). |

### B. Steering warm

| # | Verdict | Evidence |
|---|---|---|
| 5 | PASS (stub) | `a herdr-blocked stage holds warm too` — `status:'held'`, no `/exit`, no produces warning. Real herdr `blocked` state: N-V. |
| 6 | PASS | `holdWarm` prints `workspace … pane … agent …` (`conduct.mjs:513`); `one reviewer holding does not stall the other three` proves the other three finish. |
| 7 | **FAIL** | The session identity itself is right — `a settled stage with open DECISIONS holds warm, and answer costs no second boot` asserts exactly one `agent start` and one session id, and mutation **MF** kills it. But the cycle does not complete for `build-*` / `review-*` labels: `conduct answer` throws `TypeError` and drops the finished task. **F1**. |
| 8 | PASS | `a headless gate still answers headless, even with herdr up` — `REVIEWERS` carries `headless: true` on `security` and the `-p` child is spawned in both modes. |

### C. Speed

| # | Verdict | Evidence |
|---|---|---|
| 9 | **N-V (partial PASS)** | Structure proven: `the review fan-out starts all four reviewers before it consumes any completion` — one `.map` + `Promise.all`, every reviewer started before any await, codex joining the timeline. The *"no more than half the sum of the individual durations"* measurement needs a live run (§4). |
| 10 | **N-V** | Pane-vs-headless reviewer token equivalence is **untested and untraced** — absent from `02-design.md`'s traceability table (rows jump 9,11 → 12-15) and from the suite. Needs one live A/B. |
| 11 | PASS | `build tasks run strictly sequentially, and a concurrent one fails here`. Mutation **M1**, twice: with the `after` gate intact it dies at the dependency check; with the gate *also* removed it dies on the behavioural assertion — `t2 started before t1 was finished with`. Neither mutation used `Promise.all`, so the source-read guard was not what caught it. |

### D. Watching

| # | Verdict | Evidence |
|---|---|---|
| 12 | PASS (stub) | `conduct start builds the cockpit: a workspace, a plan pane and a diff pane, and nothing else` — boots no agent. Matches DECISIONS D2 ("skeleton at start, stage panes on demand"). |
| 13 | PASS (stub) | `launchStage` runs `agent start <label> --kind claude --pane <id>` then cross-checks with `agent get` before `agent prompt`. Deviation: it uses `agent get`, not `agent list`; and `> <label>` is printed *before* the pane is found (deliberate, t6 — it is the fan-out timeline). |
| 14 | **FAIL** | The feature never calls `agent read` and a test forbids it; the design records that it returns `agent_not_idle` while working. **F3**. |
| 15 | PASS | `a pane stage runs start -> prompt -> watch -> finalize, and leaves the pane open` — settles on herdr state (`working;unknown;idle`), never a sleep; pane left open; `!! stage "…" did not write …` fires. Mutation **MD** (settling on `unknown`) kills it. |
| 16 | PASS | `a stage prompt is delivered as a FILE, byte-exact` — 2KB+ body with newlines, quotes and backticks read back identical; `launchStage types ONE line - the path`. Mutation **MC** (5 red). End-to-end through a real agent: N-V. |

### E. Metering

| # | Verdict | Evidence |
|---|---|---|
| 17 | PASS | Live `conduct report` on `smoke-test`: `spec 110k / 4k / 3`, `design 556k / 17k / 10`. Pane path: `ok build-t1 ctx 2k out 20 2 calls` observed in the F1 repro. |
| 18 | PASS | **Real-data cross-check** (§2): 26 records → 10 requestIds, naive 1,453,670 vs deduped 556,185 (2.61×); `sessionTotals` = the deduped figure exactly. Mutation **M2** → 9 red, **M2b** → 1 red. |
| 19 | PASS (inspection) | Both modes reach `sessionTotals` via `stageSum`; both write `contextTokens`/`outputTokens`/`turns`/`source`. Headless additionally has the `streamTotals` fallback, which pane mode has nothing to fall back to. No mode-specific metering field. No dedicated test. |
| 20 | PASS | `sessionTotals is addressed by session id: a sibling session is never counted`; mutation **MB** (scan-and-guess) → 5 red. |
| 21 | PASS | `a tester session in the verify worktree is metered by its recorded id, wherever its transcript landed`. Green-on-arrival per the build log — **re-verified by mutation**: both **MA** and **MB** kill it. |
| 22 | PASS | `grep '\$' scripts/pipeline/*.mjs` outside regex literals: nothing. `no conductor output contains a dollar figure`; mutation **M4**. Live `report` output clean. No `budget`, no `--max-budget-usd`, no `overBudget` remain in `conduct.mjs`. |
| 23 | PASS | Live: `5h window (trailing - no reset seen)  ctx 75.2M  out 98k  512 calls` / `7-day rolling  ctx 4.09B  out 4.5M  11515 calls`, machine-wide. Anchored label with reset time and countdown is covered by `report prints machine-wide window totals, anchored when a future reset is known`. |
| 24 | PASS | `report … no % / remaining / headroom`; mutation **M6** → 2 red. `latestRateLimitAnchor` returns `{resetsAtMs, rateLimitType}` only — no quota field is read, so none can be invented. |
| 25 | PASS | `a stage starting near a reset gets an advisory and starts anyway` — `resetAdvisory` returns a string and `runClaude`/`runPaneStage` print it before `spawn`, never branching on it. `RESET_ADVISORY_MIN = 15`. |
| 26 | PASS | `stageTotals falls back to the stage log result object when the transcript has not flushed` → `source:'result'`; `stageTotals prefers the transcript and says so`. |
| 27 | PASS | `report heals a zero-token stage from the transcript, once, and prints unknown for the unrecoverable` — asserts `source` persisted as `'transcript'`; `plan heals the same way`. |
| 28 | PASS | Same test: an unrecoverable row prints `unknown`. Mutation **M3** kills it. `review-codex` correctly records `source:'codex'` and prints `0` — a measured zero, distinct from `unknown` — though nothing tests that distinction. See **F6** for the column collision. |
| 29 | **FAIL** | The clean headless path is proven by a real run (`smoke-test/run.json` + the live `report` above). But after a decisions gate, `conduct answer`'s tokens are dropped: transcript says 5,000 ctx / 5 calls, `report` keeps printing 3,000 / 3. **F5**. |

### F/G. MCP

| # | Verdict | Evidence |
|---|---|---|
| 30 | PASS (**live**) | `mcp_servers: [{"name":"playwright","status":"connected"}]`, 24 `mcp__playwright__*` tools with `--mcp-config .mcp.json`. |
| 31 | PASS (**live**) | Without `--mcp-config`: `mcp_servers: []`, 0 mcp tools. `.mcp.json` declares exactly one server; `.mcp.json declares exactly one server, a browser one, and nothing else` fails on a second or a `sanity` entry. Every stage gets `--strict-mcp-config`. |
| 32 | PASS | `an uninstalled browser server warns and degrades the stage, never fails it` — `mcpAdvisory` text printed, no `--mcp-config`, `runClaude` neither returns nor exits on it. |

### H. Herdr absent

| # | Verdict | Evidence |
|---|---|---|
| 33 | PASS | `paneMode` has no opt-in; `available()` returned `true` live against herdr 0.8.2. `conduct start builds the cockpit` with no flags. |
| 34 | PASS | `--no-panes keeps conduct start on the headless path without touching herdr`; the flag is read per-invocation (`noPanes(args)`) and never written to `run.json`. |
| 35 | PASS | `conduct start says why when herdr is not there, and starts the run anyway` — one line, run completes. |
| 36 | PASS (stub) | `launchStage retries once, then falls back headless printing herdr error verbatim`; `agent_not_ready is a live agent on a dialog, not a failed launch` — and the same wording under a different code *is* a failure, so the branch keys off the code. Against a real herdr timeout: N-V. |

### I. Security

| # | Verdict | Evidence |
|---|---|---|
| 37 | PASS (**live**) | Five hostile slugs (`../escape`, `UPPER`, `a/b`, `$(touch pwned)`, `x;touch pwned2`) each exit 1 with `slug must match /^[a-z0-9][a-z0-9-]{0,48}$/`. Post-state: no run directory, no `.active`, no marker file, nothing created outside `docs/runs/` — `find` shows only the three files the sandbox started with. `checkSlug` is `start`'s first statement. |
| 38 | PASS | `launchStage types ONE line - the path - and never a byte of the prompt` — a prompt carrying `$(node -e …writeFileSync(marker)…)` and `` `touch <marker>`; echo "done" ``: the marker file does not exist, and no fragment (`PWNED`, `$(`, `touch `, `done`) appears anywhere in the herdr argv dump. Mutation **MC**. |
| 39 | **FAIL** | Labels, pane ids, slug-at-cockpit and the base sha are all allowlisted (`herdr identifiers are allowlisted before they ever reach a command`, anchored regex asserted). `writePrompt` is the hole. **F4**. |
| 40 | PASS | `windowTotals reports counts only` seeds a foreign transcript whose message content is `the api key is FOREIGNSECRET` and asserts every field of the return is `number \| boolean \| null`. Mutation **M5**. `run.json` after a real `report` holds ids and numbers only. |
| 41 | PASS | Same test asserts `FOREIGNSESSION`, `FOREIGNREQ`, `FOREIGNUUID`, `someone-elses-repo` are all absent. Confirmed on real data: the live `report` above scanned this machine's other projects and emitted only counts. |
| 42 | PASS | `sessionFiles` addresses `<proj>/<sid>.jsonl` + `<sid>/subagents/*.jsonl`; `sessionTotals(undefined)` returns zeros rather than guessing. Mutation **MB** (newest-transcript guess) → 5 red. |

**Totals: 35 PASS · 5 FAIL (1, 7, 14, 29, 39) · 2 not verifiable (9 partial, 10)**
— plus the live-execution coverage gap in §4, which sits under every pane-mode
PASS above.

---

## 6. What has to happen

Findings go to a developer; nothing here was fixed.

1. **F1** — route `cmds.answer` through `stageSpec(label)`, and record a finished
   `build-*` in `tasksDone` the way `cmds.resume` does. This one loses work.
2. **F5** — make `conduct answer` meter what it spends, in both branches.
3. **F2** — `plan` must mark a `running`/`held` stage `[>]`. The branch already
   exists and is unreachable.
4. **F4** — `checkSlug` in `writePrompt`.
5. **F3** — criterion 14 goes back to the owner: amend or drop it, with the
   measured reason. Do not leave it discharged by its own negation.
6. **F6** — pad the `unknown` columns.
7. **Restart the herdr server**, then run one real stage in a pane and one real
   interrupt-and-resume, and append the evidence here. Until that exists,
   criteria 1, 5, 6, 9, 13, 15, 16 and 36 are asserted against a stub.
