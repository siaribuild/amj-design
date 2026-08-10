# Ops console redesign — UX pass

Brainstorming and UX only. **No application code was changed.** The deliverable is
`ops-redesign-prototype.html` at the repo root: one self-contained, interactive file with no
build step, no network and no backend. Open it from the filesystem; add `?dev=1` for the
states menu.

## Read these in this order

1. **`UX-AUDIT.md`** — read this *first*. It is a hostile completeness review of the spec, and
   its verdict on the spec as written is **"not safe to build from"**. It lists 11 capabilities
   the spec dropped, 9 it degraded, and 16 things it **invented** — values rendered on screen
   that no ops endpoint returns.
2. **`UX-SPEC.md`** — the full specification (sections A–I): thesis and principles, the
   information architecture with a 291-row no-regression contract, screen-by-screen layouts,
   the component vocabulary, the interaction model, the evidence and selection-log design, the
   order flow, and the prototype build plan.

**The prototype implements the spec *as corrected by the audit*, not the spec as written.** Where
the two disagree, the audit won. The corrections that mattered most:

| Audit | The spec said | The prototype says |
|---|---|---|
| I4 | `Medium — a second candidate scored within 0.05` | `Medium — not a clear win; the reason is not recorded` — `medium` is the residual bucket, so a numeric cause would be invented |
| I3 | `Missing when chosen: orientation · room area` | `missing_inputs_json` lives on `ai_proposal_line`, which no ops endpoint reads — so the absence is printed |
| I1 / I2 / I7 | rule + ranker versions, a pricing snapshot, an archetype snapshot | three named absences — none of the three is on the wire |
| I5 / I6 | a MACHINE PROPOSED column, and `edited · you · 6 Aug` | the machine column names its own unavailability when there is no snapshot; the EDITED column reads `edited` and nothing else, because no per-field actor or date is recorded |
| I14 | `LINES READY n of m`, always | once an order exists the metric becomes `CONTRACT LINES n` — `unresolvedLineCount` counts draft lines that no longer drive anything |
| I13 | one fixture drawn in two mutually exclusive states | `valueBasis: "contract"` is emitted only when an order exists, and then the stage label is the order's |

## What the data cannot support

The owner's wireframe put **retained source evidence** — a sheet reference, a page number, a
highlighted region and `confidence 94%` — in the widest column. Four of those five cannot be
built today:

- `evidence_items.page_no`, `sheet_ref` and `region_json` are **always NULL**, and the Worker
  has no page rasteriser, so there would be no bitmap to draw a region on even if one existed.
- `extracted_text` is a **synthesised** summary, not the verbatim schedule row.
- The only deterministic confidence in the system is a three-value band.

So the widest column goes to the thing that *is* fully present and is what the reviewer is
actually adjudicating — the opening, drawn, specified, split, spanned, thermally checked and
priced — and the evidence lives in a 360px rail as what it truthfully is. See `UX-SPEC.md` §F.1
and open question 1.

## The one thing worth building next

`candidate_result` already holds one row per product × variant with per-filter pass/fail, a
human-readable reason, six score components and a rank. It is the "product selection log" the
brief asks for, it is fully persisted, and **no ops endpoint reads it**. One read-only endpoint
(`GET /api/ops/lines/:id/selection`) — no new columns, no writes — turns hop 5 from a named
absence into the best panel in the console.

## How it was produced

Six parallel readers inventoried the live console (every screen, endpoint, entity and token);
four independent UX proposals were written from different lenses; a design lead scored them,
picked a winner and grafted the rest; a hostile auditor then tried to break the result. The
inventories are not checked in — they are reconstructible from the source, and the spec cites
them throughout.
