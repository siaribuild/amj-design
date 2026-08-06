# Business analyst brief — what parsing a plan set must produce

**Status:** draft for owner review. Not yet dispatched.
**Why it is written down:** the last two attempts at this problem produced code
before anyone had written down what the answer was supposed to look like. A
scaffold was built and deployed that read nothing, and a fallback was authored in
Sanity that nothing consumed. Both were avoidable by settling the output contract
first.

---

## The task, in one sentence

Document **what data a parsed architectural plan set must yield**, field by
field, so that a builder's uploaded drawings produce a correct quote — and defend
every field by naming the decision it changes.

This is a **data contract**, not a design. You are describing the output, not how
to obtain it.

---

## Explicitly out of scope

Do not write, recommend, or evaluate any of the following. They are engineering
decisions already in flight and an opinion here will be ignored:

- How the PDF is read — vector geometry vs rasterising to images.
- Which model, what prompt, what schema syntax, what libraries.
- Database columns, migrations, or API shapes.
- Whether a given field is *technically feasible* to extract. Say what the
  business needs; feasibility is answered after, and separately.

**One hard constraint follows from that:** the contract you define must be
identical whichever way the document is read. If a field's definition only makes
sense for one extraction method, it is defined wrong. Write it so that a human
reading the sheets by hand could fill it in.

---

## Product context

`E:\Projects\amj-website-design` — a CPQ platform for an Australian aluminium
window and door manufacturer, supply-only, trade customers.

A builder uploads their drawings. The platform extracts every opening, prices it,
and a human reviews the result before it becomes a quote. The commercial promise
is "upload a schedule → priced order in about a minute", so the parse is the
product, not a convenience.

Vocabulary used throughout the codebase, and which you should use:

- **Opening** — one hole in the building, one line the customer ordered. Carries
  a **tag** (`W1`, `D3`), a width and height in millimetres.
- **Unit** — a frame we manufacture. A unit *is* a whole window: frame included,
  which is what its dimensions describe.
- **Composite** — an opening delivered as 2+ coupled units, because no single
  frame we make is large enough, or because the design calls for a mixed make-up
  (an opening window beside a fixed pane). Nesting is exactly one level deep.
- **Composition / make-up** — how an opening divides into units: how many, which
  operation each performs, how wide each is, and in what order left to right.

---

## The artefact you must ground this in

A real plan set, from the failure that prompted this work:

```
project/p_draft/91447123-7918-4c89-83d6-82fd2a8a31a0-20016_Lot 312 Banjo Boulevard_Plans.pdf
```

Fetch it to your scratch directory and **read it**:

```bash
npx wrangler r2 object get "apertly-files/project/p_draft/91447123-7918-4c89-83d6-82fd2a8a31a0-20016_Lot 312 Banjo Boulevard_Plans.pdf" --remote --file plans.pdf
```

Every claim in your document must be checkable against these sheets. If you
assert that plan sets carry a piece of information, point at where it appears in
this one. If this set does not carry something you believe is normally present,
say so explicitly — a contract built on a document nobody has looked at is how
this went wrong the first time.

---

## What the platform already gets from this document, today

Facts, not summary. All verified in production:

- The **window schedule table** printed on a plan sheet is read correctly: 19
  openings, each with tag, type text, width and height. This part works.
- **W4** carries the comment `2x 600mm WIDE AWNINGS` and is correctly built as
  `awning 600 | fixed 2000 | awning 600`.
- **W1** is `2050 × 2100`, type text `OFFSET AWNING`, no comment. It was
  delivered as **two 1025mm awnings**, because nothing knows how it divides.
- The plan-context extraction returned **0 rooms and 0 openings** for this set —
  only a postcode and a storey count.
- **No drawing is read at all.** Plan PDFs are converted to a text layer;
  no elevation, symbol, or mullion has ever been seen by anything.

So: the schedule *table* is solved. Your subject is everything the **drawings**
carry that the table does not.

---

## Who consumes your output

Every field you specify must be traceable to at least one of these. A field no
consumer uses does not go in the document — delete it and say why you considered
it.

1. **The split proposer** — `worker/lib/estimator/split.ts`. Turns a stated
   make-up into priced units. Read `proposeSplit` and the precedence chain in its
   header comment.
2. **Product selection** — `worker/lib/estimator/select.ts` + `rules.ts`. Wall
   orientation **hard-filters** candidates, so a wrong or missing orientation does
   not degrade a recommendation, it removes the correct product.
3. **Thermal requirements** — `worker/lib/estimator/thermal/computedBand.ts`.
   Room type and orientation drive the performance band an opening must meet.
4. **Human review** — the ops console shows a reviewer what was proposed and why.
   Anything a reviewer must check needs evidence attached: which sheet, which
   page, and where on the page.

Read these before writing. You are defining their input.

---

## The questions your document must answer

**A. Per opening — the composition.**
This is the core. For an opening like W1, what must the parse state?
Consider at minimum: how many units; each unit's operation; each unit's width and
height; their left-to-right order; which side an opening unit sits on; whether
the division is vertical (side by side) or horizontal (one above another).
Which of these are *required* for a correct quote and which are nice to have?

**B. Per opening — the context the drawings carry and the schedule does not.**
Room, level, wall orientation, shading/eaves projection, anything else you find on
these sheets. For each: which consumer needs it, and what happens without it.

**C. Per sheet and per document.**
What must be recorded about the drawing set itself — scale, north point, revision,
sheet numbering, discipline — and why. Is any of it needed to interpret the rest?

**D. Absence versus uncertainty.** For every field, define **three** states, not
two: the value is X; the drawings do not state it; we could not read it. These
must be distinguishable. The platform has already shipped this bug once — an
unreadable symbol was recorded as "no marks", which was then claimed as "fixed
glass", the cheapest possible product. Absence of evidence must never be
recorded as evidence of absence.

**E. Confidence and evidence.** What must accompany a value for a human to trust
or check it? Where is a confidence figure genuinely useful versus decorative?

**F. Precedence and conflict.** A plan set, a window schedule and an energy report
frequently disagree. The owner's standing rule: **the drawings are the
architectural contract and decide how an opening divides; the energy report is
produced later, can carry human error, and keeps only the thermal targets.** Where
does each plan-derived field sit against the other documents? The platform's
house rule is that a conflict is **represented, never silently resolved** — say
what representing it means for each field.

**G. What is deliberately NOT extracted.** Scope discipline is part of the
deliverable. Name what appears on these sheets that we should ignore, and why it
changes no quote.

**H. Partial success.** A 20-page set where two sheets are unreadable is the
normal case, not the exception. What is the unit of failure — the document, the
sheet, or the opening? What does a builder see?

---

## Deliverable

One markdown document at `docs/estimator/plan-parse-output-spec.md`, containing:

1. **The contract** — every field, grouped by scope (document / sheet / opening /
   unit), each with: name, type, unit of measure, the three states from (D), the
   consumer, and the decision it changes.
2. **The W1 worked example** — mandatory. Show exactly what the parse should have
   produced for W1 of this plan set, field by field, and what the estimator would
   then do with it. If the drawings do not in fact state W1's composition, say
   that plainly and say what the parse should return instead. **A truthful "the
   document does not say" is a correct answer and is more valuable than an
   invented one.**
3. **A second worked example of your choosing** from the same set, picked because
   it stresses something W1 does not — a door, a composite, a stacked opening,
   or an opening the drawings genuinely disagree with the schedule about.
4. **The precedence table** — plan vs schedule vs energy report, per field.
5. **Out of scope** — from (G), with reasons.
6. **Open questions for the owner** — anything you could not resolve from the
   documents or the code. Number them so they can be answered in a list.

---

## Acceptance criteria

Your document is finished when all of these are true, and you should state each
one explicitly at the end:

- [ ] Every field names a consumer and a decision it changes.
- [ ] Every field defines value / not-stated / not-read separately.
- [ ] Every field is expressed in a way a person reading the sheets by hand could
      fill in — no field depends on how the file is read.
- [ ] The W1 example is complete and grounded in the actual sheets.
- [ ] Every claim about what plan sets contain points at this plan set.
- [ ] Units of measure are stated everywhere (millimetres, integers).
- [ ] Nothing in the document specifies an algorithm, a model, a prompt, a
      library, a table or an endpoint.
- [ ] Open questions are numbered.

---

## What a good answer looks like

It is short enough to read in one sitting, and a developer could implement
against it without asking what a field means. It says "the drawings do not carry
this" wherever that is true, rather than specifying a field that can never be
filled. It distinguishes what the business *needs* from what would merely be
interesting.

## What a bad answer looks like

A field list transcribed from the drawing-recognition design doc without checking
it against the actual sheets. A confidence score on every field because it seemed
rigorous. A specification of information no consumer reads. Any sentence about
rasterising, vectors, or models.

---

## Reading list

Required, in this order:

- `worker/lib/estimator/split.ts` — the precedence chain and `proposeSplit`.
- `worker/lib/ai/schema.ts` — `OpeningV1`, the existing opening contract.
- `worker/lib/estimator/skills/schedule.ts` — what the schedule table already
  yields, so you do not re-specify it.
- `worker/lib/estimator/skills/plan.ts` — what the plan stage claims to yield
  today, and what it actually returned for this set (nothing).
- `docs/drawing-split-recognition-design.md` — a prior design. **Treat it as a
  hypothesis, not a source.** Its data model was written before anyone read these
  sheets, and the audit found real defects in it. Where you disagree, say so.
