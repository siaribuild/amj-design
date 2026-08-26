# Rollback to pipeline v1

v2 deliberately **does not modify** `.claude/agents/*.md`, `.claude/hooks/*`,
`.claude/settings.json` or `probity.config.ts` — it drives the same agent
definitions from the outside. So the only file v2 changed is `CLAUDE.md`.

Full rollback is therefore one command:

    cp docs/pipeline/v1-backup/CLAUDE.md CLAUDE.md

The copies of agents/hooks/settings/probity here are a belt-and-braces snapshot
taken at the same moment; restore any of them the same way if something later
edits them:

    cp -r docs/pipeline/v1-backup/agents/. .claude/agents/
    cp -r docs/pipeline/v1-backup/hooks/. .claude/hooks/
    cp docs/pipeline/v1-backup/settings.json .claude/settings.json
    cp docs/pipeline/v1-backup/probity.config.ts probity.config.ts

v2's own files (`scripts/pipeline/`, `docs/pipeline/PIPELINE-V2.md`,
`docs/runs/`) are inert once CLAUDE.md no longer points at them. Delete them or
leave them; nothing else reads them.

Git tag for the same state: `pipeline-v1`
