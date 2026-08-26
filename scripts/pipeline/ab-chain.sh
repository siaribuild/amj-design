#!/usr/bin/env bash
# Waits for the already-running v1 arm, then runs v2, then writes the comparison.
# Sequential on purpose: running both at once would contend for CPU and make the
# wall-clock half of the measurement meaningless.
set -uo pipefail
ROOT=/e/Projects/amj-website-design
OUT="$ROOT/docs/pipeline/ab-results"
MAX_WAIT_MIN=180

cd "$ROOT" || exit 1

waited=0
while [ ! -f "$OUT/v1.end" ] && [ "$waited" -lt "$((MAX_WAIT_MIN * 6))" ]; do
  sleep 10
  waited=$((waited + 1))
done

if [ ! -f "$OUT/v1.end" ]; then
  echo "v1 arm did not finish within ${MAX_WAIT_MIN} min - recording as INCOMPLETE" | tee "$OUT/v1.incomplete"
  # Measure what it managed anyway; an arm that cannot finish is itself a result.
  node scripts/pipeline/measure.mjs "$(cat "$OUT/v1.start")" "arm v1 (INCOMPLETE)" "ab-v1-gst" \
    > "$OUT/v1.measure.txt" 2>&1
fi

echo "=== v1 done (or timed out); starting v2 ==="
bash scripts/pipeline/ab-test.sh v2 > "$OUT/v2.console" 2>&1

echo "=== both arms done; building comparison ==="
node scripts/pipeline/ab-compare.mjs > "$OUT/COMPARISON.md" 2>&1
cat "$OUT/COMPARISON.md"
