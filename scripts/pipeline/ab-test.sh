#!/usr/bin/env bash
# Controlled A/B: the same feature, built once by pipeline v1 and once by v2.
#
#   bash scripts/pipeline/ab-test.sh v1
#   bash scripts/pipeline/ab-test.sh v2
#
# Both arms get the SAME ask, the same base app code, their own git worktree
# with its own node_modules, and the same concessions:
#
#   - the grill (stage 0) is skipped in both, since it is interactive by design
#   - no human is available for decision gates or the UX mock gate, so both arms
#     are told to record an explicit assumption and continue
#   - the same --max-budget-usd runaway ceiling
#
# The concessions matter: they are the only way to run either arm unattended,
# and they flatter v1 slightly, because in real use its gates cost extra
# orchestrator turns that this harness never pays for.
#
# Note this harness sequences v2's stages itself rather than calling a
# "run everything" command. The conductor deliberately has no such command -
# the mock gate is not skippable in the real tool.

set -uo pipefail
ARM="${1:?usage: ab-test.sh v1|v2}"
ROOT=/e/Projects
WT="$ROOT/ab-$ARM-gst"
OUT="$ROOT/amj-website-design/docs/pipeline/ab-results"
CAP=50
BASE=$(cd "$ROOT/ab-$ARM-gst" && git rev-parse HEAD | cut -c1-8)

mkdir -p "$OUT"
ASK=$(cat "$ROOT/amj-website-design/docs/pipeline/ab-results/ASK.txt")
START=$(node -e "console.log(new Date().toISOString())")
echo "$START" > "$OUT/$ARM.start"
echo "=== arm $ARM starting $START ==="

cd "$WT" || exit 1

if [ "$ARM" = "v1" ]; then
  # v1: one orchestrator session that spawns the team as subagents, exactly as
  # CLAUDE.md at commit 6a5668d2 describes.
  claude -p "$ASK

Run the full feature pipeline for this, per CLAUDE.md, all the way through to
product-manager acceptance. Every stage runs - a stage you cannot run is a
blocker to report, never a silent skip. Specifically, all of these must happen:

  1. product-manager  -> spec with acceptance criteria
  2. architect        -> design (files, interfaces, migrations, test plan)
  3. ux-designer + ui-designer -> interaction spec + visual mock
  4. developer        -> test-first implementation
  5. ui-designer      -> visual polish/audit of the built UI
  6. tester           -> independent verification, incl. Playwright for UI
  7. architect        -> returning design-conformance review of the final diff
  8. Codex external review over the feature diff, explicitly invoked:
       node \"\$HOME/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs\" review --wait --base $BASE --scope branch
  9. /security-review over the branch diff (headless, read-only):
       claude -p \"/security-review\" --permission-mode plan
 10. ponytail-review over the feature diff
 11. product-manager -> acceptance verdict against the spec's criteria

Findings from 7-10 route back to the developer and are fixed test-first, then
re-verified - do not patch them inline yourself.

I am not available: skip the grill (stage 0), and wherever the pipeline says to
put a decision or a mock to me, record an explicit ASSUMED: choice and continue
rather than waiting. Do not ask me anything." \
    --output-format stream-json --verbose \
    --permission-mode bypassPermissions \
    --max-budget-usd "$CAP" \
    > "$OUT/$ARM.stream.jsonl" 2> "$OUT/$ARM.err"
  # Attempt 1 was OOM-killed at 44 min and took its entire buffered result JSON
  # with it: empty stdout, empty stderr, nothing to measure. Streaming to disk
  # means a killed arm still leaves everything it managed to do.
  node -e '
    const fs = require("fs")
    let last = null
    for (const l of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      if (!l.trim()) continue
      try { const d = JSON.parse(l); if (d.type === "result") last = d } catch {}
    }
    fs.writeFileSync(process.argv[2], last ? JSON.stringify(last) : "")
  ' "$OUT/$ARM.stream.jsonl" "$OUT/$ARM.result.json"
else
  # v2: the conductor drives; each stage is its own short-lived session.
  node scripts/pipeline/conduct.mjs start gst-calc "$ASK" > "$OUT/$ARM.log" 2>&1
  node scripts/pipeline/conduct.mjs ui on >> "$OUT/$ARM.log" 2>&1
  for stage in spec design ux build polish verify review accept; do
    echo "--- stage $stage ---" >> "$OUT/$ARM.log"
    # Match v1's concession: answer any decision gate with "use your recommendation".
    if [ -f "docs/runs/gst-calc/DECISIONS.md" ]; then
      node -e "
        const f='docs/runs/gst-calc/DECISIONS.md',fs=require('fs');
        const t=fs.readFileSync(f,'utf8');
        if(!/^\s*A:/m.test(t)) fs.writeFileSync(f, t.replace(/\n(?=\d+[.)])/g,
          '\nA: proceed on your recommendation (no human available for this benchmark)\n'));
      " >> "$OUT/$ARM.log" 2>&1
      node scripts/pipeline/conduct.mjs answer >> "$OUT/$ARM.log" 2>&1
    fi
    timeout 3600 node scripts/pipeline/conduct.mjs run "$stage" >> "$OUT/$ARM.log" 2>&1
  done
  node scripts/pipeline/conduct.mjs report >> "$OUT/$ARM.log" 2>&1
fi

END=$(node -e "console.log(new Date().toISOString())")
echo "$END" > "$OUT/$ARM.end"
echo "=== arm $ARM finished $END ==="

node "$ROOT/amj-website-design/scripts/pipeline/measure.mjs" "$START" "arm $ARM" "ab-$ARM-gst" \
  > "$OUT/$ARM.measure.txt" 2>&1
tail -20 "$OUT/$ARM.measure.txt"
