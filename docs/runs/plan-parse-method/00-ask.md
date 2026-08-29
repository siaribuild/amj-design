# plan-parse enrichment — grill conclusions

Stage 0, re-run 2026-08-29 after the first attempt was reverted. This supersedes
`01-spec.md` and `02-design.md` in the same directory, which are archived (§9).
Rulings D-1…D-4 in `DECISIONS.md` survive intact.

The next session starts at **stage 1, the spec** — under v1 or `conduct.mjs`.
The architect runs **once**: not here, and not twice.

---

## 1. What the feature is, in the owner's words

The schedule parser already works and is authoritative. It reads a plan set or an
energy report and produces the openings table: opening, sizes, product
types/families, and a default split where one is needed.

**This feature enriches that table.** For each opening already identified, it goes
back into the plans and finds what the schedule cannot carry — *accurate split,
orientation, elevation, room* — anything that improves the thermal picture. Plans
do not state thermal requirements by nature; this is how the platform gets closer
to them.

> *"better accuracy" simply stands for "higher estimate accuracy", which is the
> business value proposition.*

The customer never sees the enrichment. They see openings, dimensions, and the
product selected.

## 2. Actor and need

**Customer** (`CONTEXT.md`) uploads a plan set and expects a quote. The
enrichment serves them indirectly: a better-chosen product, not a new screen.

**Staff / Estimator persona** is the actor the enrichment's *output* serves — the
reviewer who sees which openings were read, which were not, and where a reading
disagrees with the schedule.

No new or sharpened actor. `CONTEXT.md` gains vocabulary (§7), not people.

## 3. The method is the SKILL.md steps, unmodified

This is the ruling the previous attempt broke, and the one this document exists
to restate.

The method that reached 100% accuracy on the reference plan set is written down
in `containers/plan-parse/README.md` (currently reverted; recover from
`a1162db1`):

1. **Inventory** — `pdfinfo`, `pdffonts`, `pdfimages -list`, `pdfdetach -list`.
   Cheap, first, and it decides everything after it.
2. **Strategy** — text-heavy, raster-behind-text, or scanned. Scanned stops and
   names the gap.
3. **Text** — `pdftotext -layout` for data, `pdfplumber` for word coordinates.
4. **Select pages** — before rendering, not after. Four of fourteen on the
   reference set.
5. **Render and crop** — `pdftoppm` at the working DPI, crop to one opening's
   elevation.
6. **Read** — one vision call per opening, against its own crop, with the
   schedule's dimensions and type as context.

**Steps 5 and 6 mean rendering and cropping are part of the proven method.**
During this grill the orchestrator argued they were machinery to delete, reasoning
from "the owner handed over a PDF" to "the model needs no picture". The owner
stopped it:

> *"I thought that rendering is the prerequisite for following steps that Fable
> was doing? … Are you not falling for that as well?"*

He was right. The input was always a PDF; what the previous implementation added
was rasterising and cropping *before* the model call — which is step 5, not an
invention. **Nothing in the rework may replace a documented step with an
equivalent.** The container's own README states the principle: *"the steps are
reproduced rather than approximated — the same commands, the same libraries, the
same order."*

## 4. The container: kept. The Dockerfile in config: gone.

The container is not an agent's invention. Its README gives the reason: the method
is poppler and Python, none of which runs in a V8 isolate, and a container runs
them as-is.

What went wrong was **delivery, not method**. `"image": "./containers/plan-parse/Dockerfile"`
in `wrangler.jsonc` made a Docker daemon a prerequisite for *every deploy by every
person*, for one feature's benefit — and its removal stranded a live Durable Object,
which is why no deploy in this repository has succeeded since.

**Owner constraint:** *"I don't want Docker on my development (Windows) machine."*

**Ruling — pre-built registry image.** Verified against wrangler 4.111.0's own
config schema, `ContainerApp.image`: *"The path to a Dockerfile, or an image URI
for the Cloudflare registry."* CI builds and pushes when `containers/plan-parse/**`
changes; `wrangler.jsonc` names the registry URI. The method is untouched; no
development machine needs Docker; a deploy stops depending on one person's
toolchain.

### 4.1 The blocked deploy, and the first slice

`PlanParseContainer` was removed from the code while its Durable Objects remain
live in production. Cloudflare refuses any version that drops a class its objects
depend on, so **every deploy in the repository currently fails** — including the
shipped ops2 fixes, which are on `main` and not in production.

The first slice restores, minimally: the class, its `durable_objects` binding, and
the `v1` migration — **without** the `containers` block. Deploys unblock; the
namespace survives for the rework; the registry image lands with the slice that
needs it. Re-declaring an applied migration tag is a no-op; Cloudflare tracks
applied tags remotely.

## 5. Python or Node — the architect's call, with the tie-break stated

> *"last agent has convinced me that python is not required for this… I'd
> appreciate the benefit of reusing the stack, but not at the expense of results,
> of course."*

That sentence is the deciding rule. Two corrections the architect must have,
because the case as argued rests on a false premise:

- **`boto3` does not distinguish them.** The argument that a Python container
  needs S3 credentials — a new secret, new blast radius — describes an
  architecture nobody proposes. `boto3` and `anthropic` are in
  `requirements.txt` and appear nowhere in the code, and the README is explicit:
  *"It holds NO credentials: the Worker owns R2, D1 and the vision call, and the
  PDF goes in over the wire while the crops come back the same way."* The right
  response is to delete two lines from `requirements.txt`.
- **The evidence is not symmetrical.** The Node path's "proven this session"
  claims live in reverted code and are not in the repository. The Python path's
  evidence is the manual run that reached 100%.

What genuinely remains: **Node** buys one PDF library across the codebase, so the
crop box and the geometric second opinion's frame box share a coordinate space,
plus a leaner image and shared types. **Python** buys fidelity to the proven run.

Whichever is chosen, §3 binds: a substitution must reproduce the step, and the
release gate is what says whether it did.

## 6. Where each fact comes from — the two priority ladders

Binding. Owner, 2026-08-29.

**Architectural** — size, splits, types:
1. plans, advanced parse
2. energy report, if plans do not exist
3. schedule table

Plans are a binding build contract and win on architectural aspects.

**Thermal** — target Uw and solar gain:
1. energy report
2. calculated by the platform's thermal modelling — **advisory, not authoritative**
3. system defaults from project location (MVP: Melbourne only)

*Advisory* has a precise meaning the owner gave: **the platform is not becoming
thermal certification software.** It uses target Uw and solar-gain values for
**product selection**. ops2 shows **one** value — not a set of competing ones —
and how it matches the thermal properties of the product offered.

## 7. Files, bundles and page classification

Parsing is **per file**. Upload already labels a file as plans or energy report.

**An energy report may have plans bundled into it** — perhaps always, unconfirmed.
So the pass cannot assume a file is one kind throughout: it must establish which
pages are which before the ladders in §6 can be applied. This is step 4 of the
method ("select pages") carrying one extra output.

## 8. Two bars, and they are not the same bar

**Release — internal.** On the reference plan set, every opening's split,
orientation, elevation and room is read correctly, or it does not ship. D-1's
19-of-19 stands, and D-1's consequence stands with it: if fewer than 19 openings
are actually drawn, the owner is told in those words rather than the bar being
quietly relaxed.

> *"100% accuracy is internal target. if it is not accurate, inconsistent or even
> worse - misleading, we will not use it."*

**Runtime — the customer.** A parse failure must never stop the journey. Corrupted
file, unseen drawing format, model failure: the customer still submits the quote,
a human reviews it, and the fallback carries the estimate as it does today.

**The only unacceptable outcome at either bar is a confident wrong answer.** A
vision model fails silently where geometry fails loudly; "could not read this" must
stay a first-class answer.

**It is a switch, not a release decision.** `AI_EXTRACTION_MODE` exists on main
(`wrangler.jsonc:89`, `worker/types.ts:74`). Off, the schedule table and the
default split carry the quote exactly as today. That makes "we will not use it"
a minute's work rather than a revert.

## 9. Progress — the customer watches

**Budget ~2 minutes.** The reverted implementation took 120–150s for 19 openings.
One vision call per opening at 2–5s is ~40–95s serial, ~10–20s at five concurrent.
Twenty seconds would be *"golden"*; anything inside two minutes is acceptable
**provided the counter moves**.

**Per opening, not a bar.** Owner: *"per opening is better - consistent with the
current experience and no one trusts progress bars anyway."* The stages, in his
words: uploading file → reading schedule (19 found) → reading openings (n of 19)
→ matching products.

`src/components/DocumentProgress.tsx` on main already carries the base stages;
`f0714fec` shipped *"the customer sees 'opening 7 of 20'"* on the extraction step.
The enrichment extends it — it does not build a second surface.

**The counter advances on openings that come back unread.** A counter that skips
what it could not read is the silent failure the verification stage exists to
prevent.

**A partial-failure message is allowed and must ask nothing of the customer.**
Owner: they may check dimensions, counts, IDs, add comments — *"work with the
quote to the extent that they can"* — but the message must not imply there is
something they must fix. Unread openings surface to ops, not to them.

## 10. What is archived, and what is not

**Archived** — superseded by this document:
- `docs/runs/plan-parse-method/01-spec.md`
- `docs/runs/plan-parse-method/02-design.md`

Both are careful and both are downstream of a render-and-crop architecture that
grew *around* the method rather than from it. Their coordinate-space section is
called load-bearing; it is machinery, not method.

**Stands, unchanged:**
- `DECISIONS.md` — D-1…D-4, the owner's
- `docs/estimator/drawing-parse-design.md` **§1 route decision** — *the model
  reads the drawings*, and the geometric route is a corroborating check. This
  grill sharpens it; it does not overturn it.
- `docs/estimator/plan-parse-output-spec.md` — the output contract, five fields,
  three states
- `docs/adr/0015-pass-a-names-nothing-the-floor-plan-places.md`
- `migrations/0059_drawing_read_progress.sql` — applied to production, reusable

## 11. Known gaps the next session inherits

1. **The reference PDF is not in the repository, by design.** Customer material.
   R2: `project/bbc56c3e-371f-4e4c-876a-5f4605f88027/…Plans.pdf`. Any committed
   fixture derived from it must be checked for title-block content — client name,
   site address, project number. Three drawing crops were purged from git history
   on 2026-08-28 for exactly this reason (#26, #27).
2. **`labels.json` does not exist.** D-2 makes the label sheet a precondition for
   scoring, and requires the owner to confirm the truth table once before the gate
   is judged against it. A gate scored against an unconfirmed table measures
   agreement with ourselves.
3. **Orientation is in scope**, on the owner's own list in §1. The archived spec
   predates that and excluded it.
4. **Two dangling references** in the archived spec (`01-spec.md:25`,
   `02-design.md:7,106`) cite drafts that are not on `main`; recoverable from
   `96ba911f` if wanted, but they are superseded drafts with known errors.
5. **The container source is reverted.** Recover from `a1162db1`:
   `Dockerfile`, `README.md`, `pipeline/`, `requirements.txt`,
   `worker/lib/drawing/container.ts`, `scripts/tests/drawing-extraction.test.mjs`.

## 12. Why the first attempt failed, and what changes

Not the code. The owner's own diagnosis:

> *"the now-legacy parsing attempt failed miserably with that, have not followed
> the standard V1 practice."*

The v1 pipeline is documentation, not machinery. What is mechanically enforced —
Probity's TDD gate, the Codex stop-gate, agent-guard, the semgrep sweep — is a
short list. The grill, the spec, the design, the mock gate, the tester and the
per-feature review are convention, and a model under pressure skips the column
with no teeth. The previous attempt had the same `CLAUDE.md` in front of it.

`scripts/pipeline/conduct.mjs` on `feat/health-endpoint` is the answer — *"a
script, not a model… gates stop the conductor, not a model"* — but it is still
in testing and the owner will not block this feature on it.

**So, whether this runs under v1 or v2, two gates are non-negotiable:**

1. **A test file the design names must exist before the slice closes.** The
   orchestrator violated this during the ops2 run in the same session and only
   the architect's conformance pass caught it.
2. **The tester is a different agent from whoever implemented.** Also violated in
   that run: the orchestrator wrote its own verification. `CLAUDE.md` is explicit —
   *"the orchestrator may implement, but never reviews its own work."*

**Implementation does not start until the owner says so.**

## 13. Decisions needed

**None.** The frontier closed empty. §5 is the architect's to decide, with the
owner's tie-break recorded and both corrections supplied.
