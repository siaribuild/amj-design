# Rollback to pipeline v1

v2 deliberately **does not modify** `.claude/agents/*.md`, `.claude/hooks/*`,
`.claude/settings.json` or `probity.config.ts` — it drives the same agent
definitions from the outside. So the only file v2 changed is `CLAUDE.md`.

Full rollback is therefore one command:

    cp docs/pipeline/v1-backup/CLAUDE.md CLAUDE.md

**DO NOT blanket-restore `hooks/`.** This snapshot predates a fix that matters:
`probity-subagent-shim.mjs` here resolves `node_modules` from `payload.cwd`
alone, and Claude Code reports a POSIX path there after any `cd`, which
`path.join` cannot resolve on Windows. The shim then took its fail-closed branch
and denied EVERY Bash/Write/Edit for the rest of the session — including the
edits needed to repair it — while reporting that probity was not installed, when
it was present the whole time. The live shim resolves against `payload.cwd`,
`CLAUDE_PROJECT_DIR` and `process.cwd()` in turn. Restoring this copy over it
reintroduces the bug. See `docs/adr/0013-probity-direct-shim-not-plugin.md`.

The live shim has also since dropped its subagent-transcript rewrite, which
existed only because v1 ran the developer as a subagent. If you are genuinely
rolling back to v1's orchestrated pipeline, that half IS needed again — take it
from this snapshot and merge it into the current file, rather than replacing the
current file wholesale.

The other copies here (agents/settings/probity config) are a belt-and-braces
snapshot taken at the same moment; restore any of them the same way if something
later edits them:

    cp -r docs/pipeline/v1-backup/agents/. .claude/agents/
    cp -r docs/pipeline/v1-backup/hooks/. .claude/hooks/
    cp docs/pipeline/v1-backup/settings.json .claude/settings.json
    cp docs/pipeline/v1-backup/probity.config.ts probity.config.ts

v2's own files (`scripts/pipeline/`, `docs/pipeline/PIPELINE-V2.md`,
`docs/runs/`) are inert once CLAUDE.md no longer points at them. Delete them or
leave them; nothing else reads them.

Git tag for the same state: `pipeline-v1`
