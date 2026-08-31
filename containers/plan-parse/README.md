# plan-parse container

The SKILL.md reading method's mechanical half, unmodified, on Cloudflare
Containers.

**Status: built.** Front-loaded in `wrangler.jsonc` behind the `PLAN_PARSE`
Durable Object binding once the image is pushed to the Cloudflare registry —
see `.github/workflows/container-build.yml`. No public route, no service
binding, no hostname; the Worker is the only caller (02-design-v2.md §9 AB-5).

## Why a container

The method that reached 100% accuracy on a real plan set is a poppler and
Python method: `pdfinfo`, `pdffonts`, `pdftotext -layout`, `pdftoppm`,
`pdfimages`, `pdfdetach`, `pdfplumber`. None of those run in a V8 isolate.
Containers run them as-is, which means the steps are reproduced rather than
approximated — the same commands, the same libraries, the same order
(ADR 0016).

## Division of labour — mechanics here, judgement in the Worker

This container performs only the SKILL.md steps that are **mechanical**:
inventory, text extraction, rasterising and cropping. Every **judgement** —
strategy, page selection, box-to-tag assignment, the vision reads, validation
— runs in the Worker (`worker/lib/drawing/`), where it is unit-testable
without Docker and where it holds no model credentials the container would
otherwise have to carry. This is a process-boundary choice, not a step
substitution: selection still happens before rendering, from this
container's own `/inspect` output.

## The steps, and where each runs

| # | Step | Runs |
|---|---|---|
| 1 | Inventory — `pdfinfo`, `pdffonts`, `pdfimages -list`, `pdfdetach -list` | **here** |
| 2 | Strategy — text-heavy, raster-behind-text, or scanned | Worker |
| 3 | Text — `pdftotext -layout` + `pdfplumber` word coordinates | **here** |
| 4 | Select pages — before rendering, from step 3's output | Worker |
| 5 | Render + crop — `pdftoppm` at the working DPI, PIL to one window | **here** |
| 6 | Read — one vision call per opening, against its own crop | Worker |

## HTTP contract

One job = one file. Request framing: one JSON line, `\n`, then raw PDF bytes.

```
GET  /            → 200/503 {"ready": bool}          (poppler on PATH)
POST /inspect      {"maxPages": 60}
POST /render        {"pageNo": 7, "dpi": 150, "crops": [[x0,y0,x1,y1], …]?}
```

Full contract types: `worker/lib/drawing/contract.ts`. Crop rectangles are
PDF points; `server.py` converts to pixels at the render DPI.

## Local run

```bash
docker build --platform linux/amd64 -t plan-parse .
docker run --rm -p 8080:8080 plan-parse
curl -s localhost:8080            # readiness
```

No development machine needs Docker to *deploy* this: CI builds and pushes
the image, and `wrangler.jsonc` names it by registry URI
(02-design-v2.md §1, §10).

## Instance sizing

**`basic`** (¼ vCPU, 1 GiB, 4 GB disk). Not `lite` — an A3 sheet at a working
DPI does not sit comfortably in 256 MiB. Image size is capped by the
instance's disk and is what sets the 1–3 s cold start, so the image stays
lean: no `boto3`, no `anthropic` (the container has no use for either — it
holds no credentials and makes no outbound call).
