# plan-geometry — the Stage 0 proof, kept this time

This is the harness behind [`docs/estimator/drawing-parse-design.md`](../../../docs/estimator/drawing-parse-design.md).
It reads how an opening **divides** out of a plan set's vector line-work, with no
rasteriser, no model call and no new dependency — `unpdf` is already a runtime
dependency of the Worker.

**Why it is committed.** The original proof (2026-08-10) was run in a session and
never written to disk. The design's numbers survived; the code did not, and
rebuilding it on 2026-08-27 cost a session. It is small. Keep it.

## Running it

The fixture is a customer document and is deliberately **not** in the repo. Fetch
it beside these scripts:

```bash
npx wrangler r2 object get "apertly-files/project/560e1909-0370-44c6-96de-a896e9cb3945/b9d9c14f-f19a-42d6-81cf-95445a6b5a58-20016_Lot 312 Banjo Boulevard_Plans.pdf" --remote --file plans.pdf
```

`openings.json` is the schedule the platform already extracted — `[{tag, w, h, op}]`.

```bash
node scripts/research/plan-geometry/compose.mjs
```

## What each file is

| file | stage | what it does |
|---|---|---|
| `decode.mjs` | A | page → line segments. Composes the CTM through save/restore/transform/form-XObject and decodes `constructPath`. |
| `frames.mjs` | C | given a KNOWN opening size, finds that rectangle; then its mullions and symbols. |
| `compose.mjs` | — | drives A+C over the schedule and prints the composition per opening. |

## Two traps this cost real time to find, both load-bearing

1. **pdf.js emits the flattened `constructPath` form.** `args = [paintOp, [path], bbox]`,
   where the path is one flat array of `DrawOPS` — `moveTo:0, lineTo:1, curveTo:2,
   quadraticCurveTo:3, closePath:4` — not the older per-op array. Decoding it as the
   older form yields nothing and looks like an empty page.
2. **Never merge collinear segments before finding a frame.** A window stile is
   routinely collinear with, and *contained inside*, a longer building line at the
   same x. Any merge that joins overlapping spans swallows the stile into the wall
   and the frame becomes unfindable. The drawn segment IS the member.

Clip paths are excluded: a clip is not drawn line-work, and including it means
reading the window the sheet is cropped to instead of the window on it.
