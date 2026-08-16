# Issue tracker

Issues for this repo live on **GitHub Issues** at **`{{OWNER/REPO}}`**. Use the `gh` CLI with `-R {{OWNER/REPO}}` on every issue command.

- **Creating**: `gh issue create -R {{OWNER/REPO}} ...`
- **Wayfinding operations**: the wayfinder map is a single issue labelled `wayfinder:map`; its decision tickets are child issues of the map (use GitHub's native sub-issue relationship). Find the open frontier by querying open child issues of the map.
- **Blocking edges** (to-tickets): use GitHub's native "blocked by" relationship where available; otherwise a "Blocked by: #n" line at the top of the issue body.
- **Labels**: apply `ready-for-agent` to tickets that are agent-grabbable by construction (see `triage-labels.md`).
- **PRs as a request surface**: off.
