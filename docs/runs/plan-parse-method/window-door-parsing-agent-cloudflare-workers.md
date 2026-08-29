# Agent Instructions: Window & Door Composition Extraction — Cloudflare Workers Runtime

Adaptation of the local-toolset pipeline for Cloudflare Workers. The phase logic, symbology rules, reconciliation policy, and output contract are **identical** to the base instructions (`window-door-parsing-agent-instructions.md`) — read that first. This document covers only what changes: toolchain, memory model, storage, and orchestration.

## Runtime Constraints That Shape the Design

| Constraint | Value | Consequence |
|---|---|---|
| Memory per isolate | 128 MB | Cannot hold a full A3 page at 300 dpi in RGBA (~66 MB) plus working buffers. Render **grayscale** and **region-clipped**. |
| CPU time | 10 ms free / 30 s default, configurable to 5 min paid (`limits.cpu_ms`) | WASM rasterization of a page takes real CPU. Paid plan required; set `cpu_ms` explicitly. Time spent awaiting `fetch` (vision calls) is wall-clock, not CPU — free. |
| Worker bundle size | 3 MB free / 10 MB paid (gzipped) | The PDF WASM engine (~3–4 MB gzipped) only fits on **paid**. |
| No filesystem, no shell, no native binaries | — | poppler, Python, pdfplumber, PIL all unavailable. Everything moves to WASM/JS + R2. |
| Step result size (Workflows) | 1 MiB | Never pass image bytes between steps. Pass R2 keys. |

**Plan requirement: Workers Paid**, with `wrangler.jsonc`:

```jsonc
{
  "limits": { "cpu_ms": 300000 },
  "r2_buckets": [{ "binding": "PLANS", "bucket_name": "plan-parsing" }],
  "workflows": [{ "binding": "PARSE_WF", "name": "plan-parse", "class_name": "PlanParseWorkflow" }]
}
```

## Toolchain Mapping

| Local tool | Workers replacement | Notes |
|---|---|---|
| `pdfinfo` / `pdffonts` | `mupdf` (npm, WASM) — `doc.countPages()`, page bounds, font enumeration | One library covers the whole pipeline; keeps the bundle under the 10 MB cap. |
| `pdftotext -layout` / `pdfplumber` word coords | `page.toStructuredText().asJSON()` — blocks → lines → chars, each with bbox | Strictly better than `-layout`: you get real coordinates for every phase (schedule parsing, tag location, marker mapping, RL datums). |
| `pdftoppm` | `mupdf` DrawDevice into a bbox-bounded Pixmap | **Region-clipped rendering** — see below. This is the key algorithmic change. |
| PIL crop/resize/threshold | Pure JS loops over the grayscale `Uint8Array` samples buffer | Trivial at crop sizes; no image library needed. |
| PNG encode for vision | `pixmap.asPNG()` | Built into mupdf.js. |
| Local disk (`/home/claude`, `/tmp`) | R2 bucket | Source PDF, intermediate renders (optional), and **evidence crops** all live in R2. |
| Vision (viewing images) | Anthropic Messages API via `fetch`, base64 image blocks | Await time doesn't burn CPU budget. Optionally pre-filter with a Workers AI vision model for cheap yes/no checks, reserving Claude for symbol reads. |
| Bash orchestration | Cloudflare Workflows | Durable, per-step retries, resumable — a natural fit for the phased pipeline. |

Alternative split if bundle size becomes a fight: `unpdf` (serverless pdf.js wrapper, tiny) for all text phases + `@hyzyla/pdfium` for rendering only. Prefer single-engine mupdf unless forced.

## The Memory-Driven Render Strategy (replaces render-then-crop)

Locally we rendered whole pages at 300 dpi to disk and cropped with PIL. On Workers, **never materialise a full high-dpi page**. Budget per render:

- A3 @ 300 dpi grayscale = 4961 × 3509 × 1 B ≈ **17 MB** — possible but wasteful
- A3 @ 300 dpi RGBA ≈ 66 MB — **forbidden**
- A3 @ 120 dpi grayscale ≈ 2.8 MB — fine for overview passes
- Typical window crop (550 × 320 pt region) @ 300 dpi grayscale ≈ **0.7 MB** — the workhorse

So:

1. **Overview passes** (Phase 4.1): full page, grayscale, **100–120 dpi**. Encode PNG, send to vision, drop the buffer.
2. **Detail reads** (Phase 4.2): render **only the predicted window region** at 300 dpi by bounding the Pixmap to the target rect — MuPDF then rasterises just that area:

```ts
import * as mupdf from "mupdf";

function renderRegion(page: mupdf.PDFPage, rectPt: [number, number, number, number], dpi = 300) {
  const s = dpi / 72;
  const m = mupdf.Matrix.scale(s, s);
  const bbox: [number, number, number, number] =
    [rectPt[0] * s, rectPt[1] * s, rectPt[2] * s, rectPt[3] * s].map(Math.round) as any;
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, bbox, false);
  pix.clear(255);
  const dev = new mupdf.DrawDevice(m, pix);
  page.run(dev, mupdf.Matrix.identity);
  dev.close();
  return pix; // pix.getPixels() → Uint8Array (grayscale), pix.asPNG() → bytes
}
```

*(API names per mupdf.js docs; pin the version and verify signatures at build time.)*

3. **Prediction of the region** comes from Phase 3 text geometry (tag projection + RL datum lines + neighbour ordering), exactly as in the base doc — coordinates are in PDF points, which map directly to the clip rect above. When prediction is uncertain, widen the clip, don't raise the dpi.

## Deterministic Pre-Measurement (new, cuts vision spend further)

Because the crop arrives as a raw grayscale buffer, do the **geometric** part of Phase 4 in code before any vision call:

- **Frame + mullion detection:** column-darkness profile (mean of `255 - v` per x-column) over the crop; peaks = vertical lines. Frame = outermost strong pair; interior peaks = mullions. Same by row for transoms.
- **`splitRatio` and `unitWidthMm`** then come from arithmetic against the schedule width — no model in the loop, and no pixel-measurement hallucination risk.
- **Faint-symbol thresholding** (`v < 250 → 0`) is one line over the same buffer.

Vision is then asked a narrower, cheaper question per pane: *"fixed, awning-chevron, casement-chevron, sliding-arrow, or louvre?"* — attach the schedule type as context, per the base doc's convention rules. Keep the reconciliation and confidence policy from the base doc unchanged.

## Orchestration: Workflow Shape

One Workflow instance per PDF. Steps keep results ≤ 1 MiB by passing R2 keys, never bytes.

```
ingest            → PDF into R2 (accept upload or fetch-by-URL), key = jobs/{id}/source.pdf
phase0_index      → open from R2, page count/sizes, structured-text keyword scan → sheetIndex (JSON)
phase1_schedule   → parse schedule rows from structured text → openings[] (JSON)
phase2_tags       → tag/room/marker coordinates, north resolution → per-tag geometry
phase3_mapping    → elevation face mapping + region predictions (pure computation)
phase4_overview   → per elevation sheet: 120 dpi gray render → R2, one vision call
phase4_read[tag]  → one step per opening: clipped 300 dpi render → R2 (evidence),
                    deterministic mullion measurement, one vision call for symbols,
                    reconcile → record   (retryable in isolation; fan out via step
                    concurrency or a Queue if the set is large)
phase5_assemble   → merge records + meta → jobs/{id}/result.json in R2
```

Why Workflows and not one long request: each step gets its own CPU budget, a failed vision call retries without re-rasterising everything, and the instance survives deploys. The north-arrow fallback (one low-dpi title-block crop) and the scanned-PDF OCR path from the base doc's appendices slot in as conditional steps; for OCR, Workers AI or an external OCR API via `fetch` replaces pytesseract.

## Evidence Contract (Workers variant)

`evidence.region` gains an R2 pointer so a human can pull the exact pixels the agent judged from:

```json
"evidence": {
  "sheet": "A6",
  "pdfPage": 7,
  "region": { "x0Pt": 228, "y0Pt": 115, "x1Pt": 360, "y1Pt": 192, "dpi": 300 },
  "r2Key": "jobs/{id}/evidence/W9.png"
}
```

Coordinates are stored in **PDF points** (resolution-independent), unlike the local doc's rendered-pixel coords — dpi is recorded only so the stored PNG can be reproduced bit-identically.

## Cost & Budget Notes

- Vision budget target is unchanged: ~3–5 overview views + 1 crop per opening. The deterministic pre-measurement typically shrinks per-crop prompts further, since the model no longer measures — it only classifies.
- CPU: rasterisation dominates. A 14-page set ≈ 4 overview renders + ~20 clipped renders — comfortably inside a 5-minute `cpu_ms` ceiling across steps, and each step individually far below it.
- Anthropic API calls: subrequest count is a non-issue (10,000/request on paid); concurrent outbound connections cap at 6 per invocation, so fan wide via steps, not `Promise.all(20)`.
- R2 doubles as a render cache: key intermediate renders by `{pdfHash}/{page}@{dpi}` so re-runs of a failed step, or a second job on the same architect's template, skip rasterisation.
