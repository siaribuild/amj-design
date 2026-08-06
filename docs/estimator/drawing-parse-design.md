# Reading the drawings — design and plan

**Status:** design for owner review. Nothing implemented.
**Output contract:** [plan-parse-output-spec.md](plan-parse-output-spec.md). Settled; not
redesigned here.
**Acceptance fixture:** W1 of `20016_Lot 312 Banjo Boulevard_Plans.pdf` →
`awning ~675 | fixed ~1375`, vertical division, no transom, awning on the left viewed from
outside. Ratio ≈ 0.33. An agent using the pdf-reading skill produced this at 100% accuracy,
so **feasibility is proven and is not what this design is de-risking.**

---

## 1. The method being reproduced

From SKILL.md, six steps, in order:

1. **Content inventory, cheaply first** — page count, is there a text layer, sample the text,
   list images, list attachments. This decides the strategy before any spend.
2. **Choose a strategy** from that inventory — text-heavy / scanned / data-heavy.
3. **Text extraction for data** — layout-preserving, with coordinates.
4. **Rasterise only the pages that matter** and look at them, because "text extraction is
   blind to charts, diagrams, figures, layout".
5. **When precision matters, do both** for the same page — text for data, image for context.
6. **Manage token cost explicitly** — ~200–400 tokens/page text, ~1,600/page image.

Steps 1, 3 and 6 are why the agent succeeded cheaply. Step 4 is why it succeeded at all: a
window elevation is a drawing, and no amount of text extraction sees it.

---

## 2. Where each step runs

The tools in SKILL.md are poppler-utils and Python. Neither exists in a V8 isolate. Cloudflare
Containers (GA) runs them literally. So the design is not an *equivalent* of the method — it is
the method, split across two runtimes by what each is good at.

| Step | Runs in | Using |
|---|---|---|
| Inventory: pages, size, metadata | **Worker** | `unpdf` — already used in `ingest.ts` |
| Inventory: is there a text layer | **Worker** | `unpdf` text extraction per page |
| Text + coordinates (`pdftotext -layout`, `pdfplumber`) | **Worker** | pdf.js text items carry transform matrices |
| Schedule table parse | **Worker** | already built — `skills/schedule.ts` |
| Tag positions, region prediction | **Worker** | text coordinates, pure arithmetic |
| **Rasterise a page or a region** | **Container** | `pdftoppm`, the actual tool |
| Vision read of a crop | **Worker** | existing model-call plumbing |
| Reconcile, persist, evidence | **Worker** | existing estimator + `evidence_items` |

**The boundary rule: the container touches pixels, nothing else.** Everything that is text or
arithmetic stays in the Worker, where it already lives and costs nothing.

### Why the container must not make the model calls

Containers bill **provisioned** memory and disk for as long as the instance is awake; only CPU
bills on actual use. A container waiting on a vision call bills 1 GiB-second every second at
zero CPU. Waiting is free in a Worker and expensive in a container — so the container renders,
writes PNGs to R2, and sleeps.

As a pure rasteriser on `basic` (¼ vCPU, 1 GiB, 4 GB), a 14-page set is roughly 60s awake:
~60 GiB-s and ~20 vCPU-s. The $5 Workers Paid inclusions (375 vCPU-min, 25 GiB-h, 200 GB-h)
cover **on the order of 1,000 plan sets a month**. Holding it open across the model calls
roughly quadruples memory-seconds and buys nothing.

`basic`, not `lite`: an A1 sheet at 300 dpi grayscale is ~70 MB before poppler's overhead,
which is uncomfortable in 256 MiB. Image size is capped by instance disk (4 GB on `basic`), and
image size drives the 1–3s cold start, so the image stays lean.

---

## 3. The part that is actually hard

Not "can a model read a window elevation" — that is proven. **It is finding the elevation
without a human.**

The agent that scored 100% was pointed at a document and asked about W1. It could look at whole
sheets and search. Our pipeline gets no such help: for 19 openings it must decide, unaided,
which page carries each one's elevation and where on that page it is drawn. Everything else in
this design is plumbing around that one problem.

What the document gives us to work with, from the ground truth: W1 is **tagged `W1/S08` on the
ground floor plan** — a tag circle carrying the window number over a sheet reference. That is
the routing mechanism, and it is exactly what the earlier `looksLikeSheetRef` helper was for.
That helper is deleted (it answered true for `WD12`, a real door prefix), but the concept is
load-bearing and gets rebuilt properly here.

So region prediction is:

1. Harvest tag circles from the plan pages: a window tag over a sheet reference.
2. The sheet reference routes to the page carrying that opening's elevation.
3. On that page, locate the tag's label in the text layer; the elevation is the drawing it
   annotates.
4. Predict a rect in **PDF points** around it, generously. When uncertain, widen the rect —
   never raise the dpi.

Every step is text and coordinates, so all of it is Worker-side and free. If it fails for an
opening, that opening is *unrouted* — a safe, reportable state, not a guess.

---

## 4. The pipeline, end to end

One Cloudflare Workflow instance per uploaded plan set. Durable, per-step retries, resumable
across deploys. Steps pass **R2 keys, never bytes**.

```
ingest         PDF already in R2 (exists today: file_asset.r2_key)
phase0_index   Worker  page count, sizes, text-layer presence per page,
                       sheet titles → sheetIndex
phase1_schedule Worker the schedule table (exists today: skills/schedule.ts)
phase2_tags    Worker  tag circles + text positions → per-tag geometry
phase3_predict Worker  route tag → elevation sheet → predicted rect, in points
phase4_overview Container+Worker  one 120 dpi grayscale render per elevation sheet,
                       one vision call, to confirm the sheet is what we think
phase4_read[tag] Container+Worker  one clipped 300 dpi crop per opening → R2,
                       one vision call, reconcile → record.  Retryable per opening.
phase5_assemble Worker merge → the output contract → opening records
```

Per-opening isolation in phase 4 is the point: a failed vision call retries one crop, not the
document. It is also the unit of failure the output spec demands — an unreadable sheet must not
void the set.

**Reused, not built:** `runStage` and `ai_stage_runs` for stage records and retries; the
existing multimodal path that already sends `imageDataUrl` for photo uploads; `evidence_items`
for provenance; the extraction-status route the document list already polls; R2 for everything.

**Built:** the container image and its binding; tag-circle harvesting; region prediction; the
symbol-reading skill and its schema; the per-page progress counter.

### Evidence

Adopting the improvement from the Workers instructions — coordinates in **PDF points**
(resolution-independent) plus an R2 key to the exact crop the model judged:

```json
"evidence": {
  "sheet": "S08", "pdfPage": 7,
  "region": { "x0Pt": 228, "y0Pt": 115, "x1Pt": 360, "y1Pt": 192, "dpi": 300 },
  "r2Key": "jobs/{id}/evidence/W1.png"
}
```

dpi is recorded only so the stored PNG can be reproduced exactly. A reviewer sees the pixels
the machine judged from, which is the only mechanism that catches a systematic misread.

### Progress

The document list already polls `extraction-status` and renders a `progressStage`. Rasterising
is the first step long enough that a stage-level label is not enough, so the stage record gains
a page counter — "sheet 3 of 4", "opening 7 of 19" — surfaced in the component that already
exists. Small, and it is the owner's stated requirement.

---

## 5. What the model is asked, and what it is not

The ground truth shows the agent **measured the split by eye** — "roughly a third", quoted as a
range, 650–700mm. That was accurate enough: against the authoritative 2050, ⅓ rounds to
`675 | 1375`, and the acceptance fixture is satisfied.

So the model is asked for two things per opening: **the ordered operations** ("awning then
fixed, left to right, viewed from outside") and **the approximate ratio**. It is not asked for
millimetres. The opening's true size comes from the schedule; the ratio is scaled against it and
rounded by the rule in the output spec.

The Workers instructions propose going further — deriving mullion positions in code from a
column-darkness profile over the grayscale crop, demoting vision to pure symbol classification.
That is a real idea and it removes a hallucination surface. **It is not in stage 1**, because
the ground truth says eyeballed ratios already met the bar, and a darkness profile has its own
failure modes (dimension lines, hatching, leaders, and the frame itself all read as dark
columns). It goes in the plan as a measured improvement, after there is something to measure it
against.

---

## 6. What could make this fail

| Failure | Cost | How it is detected |
|---|---|---|
| The set is scanned, no text layer | Region prediction has nothing to work from | Phase 0 sees no fonts; the whole document falls back to overview reads or is reported unreadable |
| No elevations in the set | Nothing to read | Phase 3 routes nothing; every opening is *unrouted* and the fallback stands |
| Tag routing wrong — crop shows the wrong window | **A confident wrong answer.** The worst case. | Only by a human looking at the stored crop. Mitigated by asking the overview pass to confirm the sheet, and by putting the tag in the crop so the model can report a mismatch |
| Sheet too large to read at usable dpi | Symbol unreadable | Crop, don't downscale — cropping is what makes this tractable on A1 |
| Model reads a chevron confidently and wrongly | Wrong operation, wrong price | Reconciliation against the schedule's type column; disagreement is a flag, never a silent overwrite |
| Convention differs by practice | Awning read as hopper | `DEFAULT_PROFILE.confirmed = true` currently makes the "don't name a family until the practice is confirmed" guard vacuous. **Open question 1.** |

---

## 7. Plan

Each stage ships independently and is independently useful. **Nothing past stage 1 is committed
to until stage 1 answers its question.**

### Stage 1 — Prove the routing, not the reading (no pipeline)

The reading is proven; the routing is not. A script, run locally against the real PDF:

- extract text with coordinates per page
- harvest tag circles and their sheet references
- for W1, W14, W16 and W4: predict the elevation page and a rect
- crop those rects with `pdftoppm` and look at them

**Pass:** the crop for W1 contains W1's elevation and nothing confusing. **Fail:** the tag
circles do not route, or the elevations are not where the routing says.

A fail here changes the design fundamentally — it would mean elevations must be found by
looking rather than by reading, which is a different and more expensive pipeline. Better to
learn it from a script than from a Workflow.

### Stage 2 — The container

`basic` instance, poppler only, one endpoint: given an R2 key, a page and a rect in points,
render grayscale at a given dpi and write a PNG back to R2. Stateless, no model, sleeps
immediately. Verified by rendering stage 1's rects through it and getting identical images.

### Stage 3 — One opening, end to end

W1 only, through the real Workflow: predict → crop → vision → reconcile → record, with evidence
stored. Verified against the acceptance fixture: `awning ~675 | fixed ~1375`, in that order.

### Stage 4 — The whole set

All 19 openings, per-opening retries, the progress counter, the unrouted state. Verified by
comparing every opening against the schedule and reviewing the crops by hand once.

### Stage 5 — Precedence and rollout

Wire the drawing-derived hint above the schedule comment and the family default, per the
precedence table. Ship behind a flag; compare against the fallback on real uploads before it
becomes the default.

### Later, once there is a baseline

Deterministic mullion measurement; the practice-profile question; scanned-set OCR.

---

## 8. Open questions

1. **`DEFAULT_PROFILE.confirmed = true`.** Today the first job from an unassessed architect gets
   its operations named at full confidence, which contradicts the design doc's own mitigation.
   Do we gate family naming on a confirmed practice profile, or accept the risk and rely on
   reconciliation against the schedule's type column?
2. **Overview pass — keep it?** It costs one vision call per elevation sheet and exists only to
   confirm the routing is on the right sheet. If stage 1 shows routing is reliable, it can go.
3. **Where does the drawing-derived hint sit against a schedule comment?** The precedence table
   says the drawings win. W4 has both — a comment saying "2x 600mm wide awnings" and an
   elevation. If they disagree, is that a conflict for review, or does the drawing simply win
   silently?
