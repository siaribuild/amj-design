# Pipeline starter template

Portable copy of this repo's agent pipeline: grill → spec → design → mock gate → TDD implementation → polish → verification → conformance → acceptance, with enforced guardrails (Probity TDD gate, Codex stop-gate, security hooks, agent-guard). Copy it into a new repo and fill the placeholders.

Everything project-specific lives in `{{PLACEHOLDERS}}` or in two files the agents read at run time (`CLAUDE.md` project section, `CONTEXT.md`) — the agent definitions themselves are generic and need no editing.

## 1. Copy into the new repo

| From template | To new repo |
|---|---|
| `agents/*.md` | `.claude/agents/` |
| `hooks/*.mjs` | `.claude/hooks/` |
| `settings.json` | `.claude/settings.json` |
| `CLAUDE.template.md` | `CLAUDE.md` — fill every `{{...}}` |
| `CONTEXT.template.md` | `CONTEXT.md` — seed actors; it grows via stage-0 grills |
| `probity.config.template.ts` | `probity.config.ts` — set the scope globs |
| `docs-agents/*.md` | `docs/agents/` — set `{{OWNER/REPO}}` in issue-tracker.md |
| `skills/d1-migration-safety/` | `.claude/skills/` — **only if the project uses Cloudflare D1**; otherwise write an equivalent safety skill for the project's own database, or skip |

## 2. Per-project setup (run in the new repo)

```bash
npm install -D @nizos/probity
```

- Enable the Codex review gate for the new workspace: `/codex:setup --enable-review-gate` (the gate's enablement is per-repo).
- Create the tracker labels (after setting `{{OWNER/REPO}}`):
  `gh label create needs-triage; gh label create needs-info; gh label create ready-for-agent; gh label create ready-for-human; gh label create "wayfinder:map"` (add `-R OWNER/REPO`; `wontfix` usually exists).
- Optional: `.claude/launch.json` for the dev server so the ui-designer can drive the browser preview.
- Restart the session after copying — agents, hooks, and skills register at session start.

## 3. Per-machine prerequisites (once per computer, not per repo)

Already satisfied on the machine this template was authored on. A new machine needs:

- **Plugins** (user scope, via `/plugin` or the marketplaces): `codex@openai-codex`, `mattpocock-skills@mattpocock`, `intent@intent` (ghaida/intent), `impeccable@impeccable` (pbakaus/impeccable), `security-guidance@claude-plugins-official`, `semgrep@claude-plugins-official`. Do **not** enable the `probity@probity` plugin — the TDD gate runs through `hooks/probity-subagent-shim.mjs` instead (the plugin's own hook can't see subagent transcripts; the shim fixes that and is wired in `settings.json`).
- **CLIs + logins**: Claude Code CLI (`npm i -g @anthropic-ai/claude-code`, then `/login` once — Probity's AI validator uses it), Codex CLI (`npm i -g @openai/codex`, login), `gh auth login`, Python 3 (security-guidance hooks).

## 4. First feature checklist

1. Bring the ask → expect to be grilled (stage 0) — idea, worth, assumptions, actors.
2. Answer the PM's and architect's decision-gate questions (iterative — several rounds is normal).
3. Approve (or push back on) the visual mock — nothing is implemented before your explicit OK.
4. Receive the acceptance verdict with evidence; you sign off.

Say "quick" / "no pipeline" for direct work; "full pipeline" to force the whole team. Guardrails run regardless.

## What deliberately does NOT copy

- `CONTEXT.md` content and CLAUDE.md house rules/commands — every project earns its own.
- The D1 migration-safety skill's *lessons* transfer only if the new project uses D1; the *pattern* (encode your worst production incident as a mandatory pre-flight skill) transfers everywhere.
- auto-mode allow/deny lists — machine-level, regenerate per project with `/auto-mode-setup`.
