# 0016 — Plan-parse runs the proven poppler/Python method, in a registry-built container

**Status:** accepted (architect ruling under the owner's tie-break, 2026-08-29)
**Full design:** `docs/runs/plan-parse-method/02-design-v2.md` §1
**Supersedes:** ADR 0013's point-2 vehicle detail ("Node — same pdf.js as the
Worker"). 0013's points 1, 3 and 4 — the model reads, output is refused not
repaired, the split release bar — stand unchanged.

## Context

The reading method that reached 100% on the reference set is a poppler and
Python method — `pdfinfo`, `pdffonts`, `pdfimages -list`, `pdfdetach -list`,
`pdftotext -layout`, `pdfplumber`, `pdftoppm`, PIL — and the re-grill
(`00-ask.md` §3) made the method binding down to the commands: *"reproduced
rather than approximated — the same commands, the same libraries, the same
order."* The first implementation substituted a Node renderer (unpdf/pdf.js +
@napi-rs/canvas) for step 5 and was reverted; its "proven" evidence left the
repository with it. Separately, the original delivery put a Dockerfile path in
`wrangler.jsonc`, which made a Docker daemon a prerequisite for every deploy by
every person and stranded a live Durable Object when removed. The owner's
constraints: no Docker on a development machine, and *"I'd appreciate the
benefit of reusing the stack, but not at the expense of results."*

## Decision

1. **Python + poppler, unmodified.** The container image is
   `python:3.12-slim` + `poppler-utils` + `pdfplumber` + `pillow` and performs
   the method's mechanical steps (inventory, text, render, crop) with exactly
   the skill's tools. No `boto3`, no `anthropic`: the container holds no
   credentials and makes no outbound call.
2. **Pre-built registry image, never a Dockerfile path.** CI builds, smokes and
   pushes the image when `containers/plan-parse/**` changes;
   `wrangler.jsonc` names a Cloudflare-registry URI (`ContainerApp.image`
   accepts one — verified against wrangler 4.111.0). No development machine
   needs Docker to deploy. The tag is bumped by hand and rarely: every prompt,
   threshold and judgement lives in the Worker, so the image changes only when
   the toolchain does.
3. **Judgements stay in the Worker.** Strategy choice, page selection,
   box→tag assignment, all three vision calls, validation, persistence and the
   method run report execute Worker-side, testable without Docker. The step
   *order* is the orchestrator's and the per-run report proves it held.
4. **`PlanParseContainer` returns under its own name.** The held-open stub
   becomes a real `Container` subclass on the same class name, binding and
   `v1` migration tag — no new DO migration, no namespace churn.

## Consequences

- The Node path's single genuine benefit — one pdf.js so the crop box and the
  geometric second opinion share a coordinate space — is forgone. It was worth
  nothing in this scope: no acceptance criterion exercises the geometric
  check, which remains a demoted future corroborator.
- The repository carries a small Python surface (`containers/plan-parse/`)
  with its own pytest, exercised only in CI. Local `wrangler dev` runs with
  containers disabled; the enrichment is off locally by mode.
- A toolchain change now requires a CI image push plus a tag bump in
  `wrangler.jsonc` — deliberate friction on the piece that must not drift from
  the proven method.
- The §7.1 release gate (19-of-19 on REF against the owner-confirmed label
  sheet) is the arbiter of whether any residual divergence from the manual run
  matters; a failed gate turns the mode var off, not the architecture over.
