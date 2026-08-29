# Security Review — `feat/herdr-pipeline`

**No security vulnerabilities found meeting the reporting bar.**

Scope reviewed: the 50 files changed vs `main` (8,934 insertions) — `scripts/pipeline/conduct.mjs`, `herd.mjs`, `measure.mjs`, `ab-compare.mjs`, `ab-test.sh`, `ab-chain.sh`, `.claude/hooks/probity-subagent-shim.mjs`, `.mcp.json`, `package.json` / `package-lock.json`, `.gitignore`. (The 10.9MB diff supplied to this review was against an empty tree, not the merge base; the branch's actual change is the pipeline v2 tooling.)

Two candidates were raised and both were refuted under adversarial verification:

| Candidate | Verdict |
|---|---|
| `conduct.mjs:1264` — `cmds.answer` hardcodes `--permission-mode bypassPermissions`, bypassing `sessionArgs()` and so ignoring `spec.readonly` for reviewer stages | **False positive as a security finding.** No untrusted principal: sibling stages (`developer`, `verify`, `fix`) already boot with the same mode over the same content, on the operator's machine. Impact only materialises via prompt injection of an agent — an excluded class. Real defect is correctness/pipeline-integrity, not a privilege boundary. |
| `conduct.mjs:558` — unvalidated `build-<t.id>` label from `02-tasks.json` interpolated into an `appendFileSync` path on the headless route | **False positive.** The writer of `02-tasks.json` (the architect stage) already runs with `bypassPermissions` and full tool access — the traversal grants strictly less capability than its author holds. Append-only, `.jsonl` suffix forced, conductor's own content. Pane mode fails closed via `checkLabel`. |

Cleared explicitly, with evidence: no `shell: true` or string-concatenated commands anywhere (all `spawn`/`execFile` with argv arrays; the one `execSync` takes two constant strings); no `eval`/`Function`/`vm`/dynamic import of parsed JSON; no hardcoded secrets; `.mcp.json` adds official `@playwright/mcp@0.0.79` from the npm registry with an integrity hash and no credentials or install script; `.gitignore` only adds ignores (`docs/runs/*/logs/`, `docs/runs/*/prompts/`), keeping raw stage transcripts out of the repo; the Probity shim's shrink removes a subagent-transcript branch that made the TDD gate *more* permissive, and preserves the fail-closed deny — no `worker/**` / `src/data/**` bypass.

---

Two non-security items surfaced, worth filing as ordinary bugs:

1. **`conduct.mjs:1260-1268`** — `cmds.answer` is the only boot path that hand-rolls argv instead of calling `sessionArgs()`, so a resumed stage silently loses `spec.readonly`, `spec.agent`, and its MCP flags. Note before fixing: the answer prompt tells the session to revise its artifact and delete `DECISIONS.md`, which a `plan`-mode session cannot do — so propagating `readonly` correctly makes reviewer answers no-ops. The design question underneath is whether a read-only reviewer should be `answer`-able at all, or whether a reviewer hold should route to the developer.
2. **`conduct.mjs:554`** — adding `checkLabel(label)` at the top of `runClaude` would match the boundary `herd.mjs` already enforces, and turn a mid-run crash into a readable `die()` when the architect emits a malformed task id.
