# plan-geometry — the Stage 0 proof, kept this time

This is the harness behind [`docs/estimator/drawing-parse-design.md`](../../../docs/estimator/drawing-parse-design.md).
It reads how an opening **divides** out of a plan set's vector line-work, with no
rasteriser, no model call and no new dependency — `unpdf` is already a runtime
dependency of the Worker.

**Why it is committed.** The original proof (2026-08-10) was run in a session and
never written to disk. The design's numbers survived; the code did not, and
rebuilding it on 2026-08-27 cost a session. It is small. Keep it.

## Running it

Both inputs are customer data and are deliberately **not** in the repo. Both must
land **beside these scripts** — the harness resolves them against its own
directory, not the shell's cwd, so the command below works from the repo root.

```bash
cd scripts/research/plan-geometry
npx wrangler r2 object get "apertly-files/project/560e1909-0370-44c6-96de-a896e9cb3945/b9d9c14f-f19a-42d6-81cf-95445a6b5a58-20016_Lot 312 Banjo Boulevard_Plans.pdf" --remote --file plans.pdf
```

`openings.json` is the schedule the platform has already extracted — the input
the whole method depends on being authoritative. Regenerate it with:

```bash
npx wrangler d1 execute apertly-db --remote --json --command "SELECT external_ref AS tag, width_mm AS w, height_mm AS h, operation_type AS op FROM opening_instance WHERE project_id='p_draft' ORDER BY LENGTH(external_ref), external_ref"
```

Take the `results` array from that output verbatim as `openings.json`.

Then, from the repo root (or any worktree with `node_modules` present):

```bash
node scripts/research/plan-geometry/measure.mjs
```

It exits non-zero if either calibration point drifts from the figures §2a
records, so it is a regression check and not only a demo.

## What each file is

| file | stage | what it does |
|---|---|---|
| `decode.mjs` | A | page → line segments. Composes the CTM through save/restore/transform/form-XObject and decodes `constructPath`. Also `elevationPages()`, which finds the sheets by their callouts. |
| `frames.mjs` | C | given a KNOWN opening size, finds that rectangle; then its mullions and symbols. |
| `measure.mjs` | — | drives A+C over the whole schedule, accounts for **every** opening in one of three outcomes, and checks the two calibration points. |

## Two traps this cost real time to find, both load-bearing

1. **pdf.js emits the flattened `constructPath` form.** `args = [paintOp, [path], bbox]`,
   where the path is one flat array of `DrawOPS` — `moveTo:0, lineTo:1, curveTo:2,
   quadraticCurveTo:3, closePath:4` — not the older per-op array. Decoding it as the
   older form yields nothing and looks like an empty page.
2. **Never merge collinear segments before finding a frame.** A window stile is
   routinely collinear with, and *contained inside*, a longer building line at the
   same x. Any merge that joins overlapping spans swallows the stile into the wall
   and the frame becomes unfindable. The drawn segment IS the member.

3. **A width only means something on an elevation.** Confirming an unmatched
   opening by searching every page was tried and inverts the answer: a floor plan
   holds a rectangle of the right width and an unrelated depth for every opening
   in the house, so all four unmatched openings "matched" a floor plan. Scope the
   search to the sheets that draw windows face-on.

Clip paths are excluded: a clip is not drawn line-work, and including it means
reading the window the sheet is cropped to instead of the window on it.

**Report `not read`, never `not drawn`.** The harness says only that no frame of
that size resolved on an elevation. Whether the opening is on the sheet at all is
a different claim and this method does not measure it — see W15 in §2a, which has
a candidate inside 2% on both dimensions whose right-hand stile is a building
line.
