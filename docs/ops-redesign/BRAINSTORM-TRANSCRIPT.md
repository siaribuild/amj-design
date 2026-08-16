# Ops redesign — the brainstorm that started it (2026-08-10/11)

Recovered 2026-08-16. This conversation ran in a server-side session
(`claude.ai/code`, started on a phone) whose transcript never synced to any
machine and is not fetchable — the session URL answers 403 to anything without
the owner's browser credentials. What survives is this copy, exported by the
owner, plus three build artifacts:

| Artifact | Where it lives now |
|---|---|
| `ops-redesign-prototype.html` ("the bench") | repo root, committed 2026-08-10 |
| `mocks/ops-ux-mock.html` | recovered from a published artifact |
| `mocks/ops-v2-full-site.html` — **the later direction** | recovered from a published artifact |

**These mocks are not a specification.** The owner's position, stated when this
was recovered: *"I do not want to set any rules based on the mock. This was a
great step toward the right direction, but that is not a set of instructions to
follow. It is a good representation of what ops need to be able to do."* Read
them as evidence of required capability, and as one demonstration that a better
console is possible — not as a design to implement. Every point in them is open
to challenge and to a better answer.

The session ended mid-flight on a usage limit, with a UX workflow still running.
Its written outputs are `README.md`, `UX-SPEC.md` and `UX-AUDIT.md` beside this
file; the same caveat applies to all three.

---

## The transcript

> **Owner:** OPS redesign. No code changes yet, just brainstorming.
> Load this static wireframe mock as an idea.

**Claude:** I'll ground the brainstorm in what the ops area actually is today
before reacting to the mock.

*[Ran 12 commands, read `OpsApp.tsx`]*

Read the mock, and read the console it would replace. Here's where I land.

### What the mock is actually proposing

Not a reskin — a change of job description. Today's console is records you
browse (`OpsApp.tsx:68`: eight tabs, a Dashboard that counts things, a
1,475-line `ProjectRecord.tsx` you scroll). The mock says ops's job is
adjudicating machine output against source, one line at a time, then releasing.
Three tabs, no dashboard, and the queue is home with the count in the nav.

### The three ideas worth keeping

1. **The evidence pane is the whole thing — and it's already half-built.** The
   centre column ("A601 · Window schedule · row W03" + the highlighted region)
   is the reason this design exists: it puts what we read next to what we
   configured, so approval is a comparison, not an act of faith. And
   `evidence_items` already stores `page_no`, `sheet_ref`, `region_json`,
   `extracted_text`, `origin`, `confidence` (migration 0016); `ops.ts:1462`
   already serves it. Nothing in the UI renders it. The new `engine.ts` makes it
   better still — with exact vector geometry we can draw the region
   deterministically instead of cropping a raster of it. This is the
   highest-value, lowest-novelty thing on the board.

2. **Approval as a checklist that gates release.** `APPROVED 0/3` with a dead
   "Release reviewed quote" button is a much better model than a workflow
   engine. It's not the approval rules we deliberately dropped — no owners, no
   routing, no permissions. It's a per-line "I looked at this," and the quote
   can't leave until every line has one. That's also honest about what the
   estimator is: assistive, not authoritative. It maps onto the existing
   `unresolvedLineCount` gate (`ProjectRecord.tsx:270`) — same idea, currently
   phrased as a warning rather than a wall.

3. **Collapsing eight tabs to three.** Queue / Orders / Products is the right
   shape: one place where work arrives, one where it's committed, one where the
   catalogue lives. Enquiries, Customers, Audit, Files, Admin don't each deserve
   a top-level door — Audit belongs inside the record's timeline, Files belong
   to the record that owns them, Customers is a search result. Enquiries is the
   awkward one: it's a genuinely separate inbox with a manufacturer-only role
   attached (`OpsApp.tsx:85`), so it either becomes a fourth tab or the
   manufacturer gets their own tiny console.

### The one thing I'd cut

"confidence 94%." We don't have a calibrated per-line number, and `ingest.ts:5`
explicitly refuses to hide a failure "behind a fake confidence." A percentage in
a review UI is the single most load-bearing number on the screen — reviewers
will start skipping anything above 90. Replace it with provenance, which we do
know exactly: "read from the text layer · A601 row W03" vs "inferred — no
schedule row matched" vs "geometry says 3 lights; schedule says 1." That last
one is the state the pane exists for, and a percentage can't express it.

### What the mock doesn't answer

- **Can ops fix a line, or only approve/ask?** Two buttons imply the reviewer is
  a rubber stamp. But we just built split/merge as an ops-first capability —
  that lives here, and "edit then approve" is the common case, not the
  exception.
- **Where's the thermal audit?** Uw/SHGC verdicts (`ProjectRecord.tsx:723`) are
  per-line judgements too. Either a fourth column or a tab within the right rail.
- **Who else is in this record?** Per-line approval invites two people approving
  the same quote from different desks. Needs at minimum "Dana approved this
  4 min ago."
- **"Request customer clarification"** sends an email — that's a new
  `emailTemplate` and a state where the line is neither approved nor rejected
  but parked, and the queue count has to reflect it.
- **$3,780.00** is a customer-facing price shown mid-review. If approving a line
  can move that number, the header total needs to be live, and "what changed
  since the customer last saw this" becomes a real question.

### The honest cost

The evidence pane needs PDF region rendering in the ops client (pdf.js in the
bundle, or a render endpoint). Everything else is re-arrangement of things that
exist.

Which thread do you want to pull? My order would be: evidence pane first (it's
the idea, and the data's already there), then per-line approval + release gate,
and treat the three-tab IA as the last step — it's the most visible change and
the least load-bearing. I can write this up as a design doc alongside
`ops-console-plan.md`, or sketch the queue screen the mock is missing.

---

> **Owner:** consult UX. extend this mock into a functional html that would
> follow, conceptually, the proposed layout/ways of working. No new
> functionality, everything that is available now must be present.
>
> The core function of ops is to review and update quotes, so the idea is to
> maximise their workspace, visualise what they are working with. Do not forget
> different pieces of information that are relevant for ops but this mock
> forgets: files, audit trails, product selection logs, presentation of order
> flow with relevant approvals along the way — run full UX job, not just copy
> this screen.
>
> No code change. UX first, styling will be next (ultimately considering using
> something like Fluid UI 2).

> **Owner:** restart. changed model for the task.

*[Ran 2 commands]*

**Claude:** Ultracode is on and this is a substantive design job, so I'll run it
as a workflow: exhaustive inventory of what ops can do today, then independent
UX concepts, then synthesis and a completeness audit. Building the prototype
comes after I've read the spec.

*[Ran workflow `ops-redesign-ux`]*

While that runs, I'll read the smaller surfaces myself so I can judge the output
independently.

*[Read 3 files, ran 3 commands]*

Workflow's running (12 agents: six inventory readers, four competing UX
concepts, a synthesis lead, then a hostile completeness auditor whose only job
is to catch anything the redesign silently drops).

Meanwhile I've read the smaller surfaces directly so I can judge the output
rather than take it on trust. Three things already worth flagging, because
they'll shape the prototype:

1. **The queue already exists and is better than the mock's.** `Projects.tsx`
   has five filters (Needs us / All open / Awaiting customer / In production /
   All) and two derived columns the mock has no equivalent for — **Waiting on**
   (Us / Customer / nobody) and **Days in stage**, sorted so the default answers
   "what do I touch next". The mock's "Review queue (3)" is a strictly weaker
   version of a thing that's already shipped. The redesign should absorb that
   list, not replace it.

2. **The design language is already fully tokenised.** `theme.css` has a
   role-named palette (`--sage`, `--ops #14150f`, `--bone`, the ink ramp,
   `--attention` distinct from `--warning`, and a four-state TONE triple
   system), plus a `t-*` type scale on three families (Space Grotesk
   display/data, Inter body). That's a clean port to a component library later,
   and it means the prototype can be pure CSS custom properties with no build
   step and still read as the same product.

3. **Files and Audit are thinner than the brief assumes.** `AdminTabs.tsx` —
   Files is one flat table (filename, project, size, scan status,
   download/rescan) with no phone treatment; Audit is a flat entity · action ·
   actor · time list with five filters and no record context. So "audit trails
   and file context in the workspace" isn't a relocation job — it's rebuilding
   both as record-scoped narratives from data that's already there. That's a
   genuine design question, not a copy-paste, and I've pointed the lifecycle
   concept at it.

I'll come back with the spec, the audit of what it drops, and a recommendation
before building anything.

*[Usage limit reached — the session ended here, with the workflow still running.]*
