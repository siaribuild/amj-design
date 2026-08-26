# plan-geometry — the Stage 0 proof, kept this time

> **The owner ruled on 2026-08-27 that the model reads the drawings.** This
> directory is now the *corroborating* route, not the primary one — free and
> exact where it works, and a cheap second opinion on what the model says. See
> the ROUTE DECISION section of the design. `render.mjs` here produces the
> model's input and is part of the primary path.

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

It exits non-zero if any of three gates drift, so it is a regression check and
not only a demo:

| gate | catches |
|---|---|
| §2a's table — the tags in each row | a decoder that loses windows |
| §2a's table — the n column, against its own row and against 19 | a document whose count and list disagree |
| §2's eight verticals for W1, and their bands | one that stops resolving the glass or sash lines |
| single-unit leaves are the sash, not the frame (W2, D2, D4) | one that picks the frame band — invisible in the ratio, which is 1.000 either way |
| §2's quoted heights at a 2050mm width | prose drifting from measurement |

The gates do not hold their own copy of these numbers. They **parse them out of
`docs/estimator/drawing-parse-design.md`** and assert the measurement against what
the document says — so editing the prose fails the run, which a copied constant
never would. A missing anchor throws rather than skipping, because a gate that
quietly stops finding its claim reports MATCH forever.
| W1 and W4's leaf widths and ratios | one that finds the right windows and measures them wrongly |

None is sufficient alone, and each was added because something got past the ones
before it. Every one was verified to fail by perturbing the thing it guards —
matcher tolerance, band threshold, frame-band rule and page scale in turn.

## What each file is

| file | stage | what it does |
|---|---|---|
| `decode.mjs` | A | page → line segments. Composes the CTM through save/restore/transform/form-XObject and decodes `constructPath`. Also `elevationPages()`, which finds the sheets by their callouts. |
| `frames.mjs` | C | given a KNOWN opening size, finds that rectangle; then its mullions and symbols. |
| `render.mjs` | 4+5 | page → PNG, and PNG → one opening's crop. The vision model's input. Needs `@napi-rs/canvas` resolvable from unpdf; not a repo dependency. |
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

## The failure mode this reader actually has

It is not crashing. It is answering confidently and wrongly, in a way that looks
right: a leaf bounded by the frame instead of the sash, a slider read through its
glazing, a window matched to a neighbour that shares its width. None of those
raise an error and all of them price a window nobody drew.

Three separate rules here began life as a tolerance that happened to work on W1 —
an inset distance, then `frac < 0.995`, then a modal band. Each survived review
because it produced the documented answer on the one opening anybody checked. So
the standing rule for this directory: **a rule with a magic number inside it is
not a rule, and any number a document quotes is a number this harness asserts.**
