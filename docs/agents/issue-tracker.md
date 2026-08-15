# Issue tracker

Issues for this repo live on **GitHub Issues** at **`siaribuild/apertly`** — the remote the working branches push to. Use the `gh` CLI with `-R siaribuild/apertly` on every issue command, since `origin` may point elsewhere.

- **Creating**: `gh issue create -R siaribuild/apertly ...`
- **Wayfinding operations**: the wayfinder map is a single issue labelled `wayfinder:map`; its decision tickets are child issues of the map (use GitHub's native sub-issue relationship). Find the open frontier by querying open child issues of the map.
- **Blocking edges** (to-tickets): use GitHub's native "blocked by" relationship where available; otherwise a "Blocked by: #n" line at the top of the issue body.
- **Labels**: apply `ready-for-agent` to tickets that are agent-grabbable by construction (see `triage-labels.md`).
- **PRs as a request surface**: off.
