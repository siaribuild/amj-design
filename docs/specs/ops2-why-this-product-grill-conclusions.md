# "Why this product" — grill conclusions

Grilled 2026-08-24 (`mattpocock-skills:grilling`, five rounds, 21 questions).
**These decisions are binding on the spec and the design.** Where a ruling
contradicts the mock, the ruling wins — the mock predates the recommendation
model that actually shipped.

Input material: `ops2-why-this-product-grill-input.md`.

---

## 1. Actors and needs

*Feeds the spec verbatim (CLAUDE.md step 0).*

**Two axes, and they are never to be merged** — owner ruling, 2026-08-24:
*"let's not confuse actor as in persona that has it's needs, and rbac enabled
limitation what a persona can do on the platform!"*

- **Persona** — who someone is and what they need. This section.
- **RBAC** — what the platform permits them to do. That is R20 (§6), and the
  role-vocabulary problem in §8. Neither of those answers a persona question.

### The persona: Estimator

**`Estimator` is a persona and it has needs of its own** — owner ruling:
*"yes, estimator, as a persona, has the needs. But that does not need to
translate into a separate rbac role with limited feature set, not at this point
of time."*

So this feature **does** sharpen the domain's persona set, and **does not** touch
authorization. The two must not be coupled: R20 stands unchanged, and no role,
capability or gate is derived from the existence of this persona. An Estimator's
needs are served by *showing them the right things*, not by fencing anyone else
out.

Today the persona is performed by one of the two owners, because there is no
separate estimator. That is a staffing fact, not a model fact — the persona
exists whether or not anyone is hired into it.

### Corrections owed to `CONTEXT.md` (architect owns the file)

Surfaced by this grill; **not** edited here, per CLAUDE.md's ownership rule.

1. **`CONTEXT.md:14` is wrong.** Staff is defined as *"an ops-console operator
   working for AMJ"*. Owner: *"staff is our own people, 2 owners at this point of
   time, only. **OpenFrame people. AMJ is manufacturer.**"* Staff work for
   **OpenFrame**. Every later stage reads its vocabulary from this file, so the
   error propagates.
2. **"Manufacturer" is not defined in `CONTEXT.md` at all** — despite being a
   live RBAC value (`role = 'manufacturer'`), the one identity `hasAssignedRole`
   excludes, and — per the ruling above — **what AMJ itself is**.
3. ~~**`CONTEXT.md:196`** reserves "payment" for *"a customer paying AMJ"*.~~
   **RESOLVED — no change needed.** Owner: *"yes, payment is to AMJ directly.
   Although it's just bank detail matter - process is manual anyway. we change
   the account number - and money goes to us."* The line is accurate today, and
   what it describes is a bank account rather than a domain relationship.

**Add `Estimator` as a persona**, distinct from Staff-the-employment-fact, with
the needs below.

### The need, in the owner's terms

> *"I want to be able to audit recommendations and accuracy of thermal
> modelling."*

> *"the bigger vision is to surface most likely alternatives hopefully making
> human's work easier."*

> *"this is for human review gate."*

Read together: the need is **confidence in the platform's reasoning, and speed
through the review** — not correction of the machine. R2 is the direct
consequence and the copy must honour it.

### The stage

The **human review gate** — between submission and issue, where the platform's
recommendation is confirmed or overridden. This is a stage in a quote's life,
not a persona and not a role. It is not named in `CONTEXT.md` today, and it is
the thing this feature exists to serve; the architect should consider adding it
to the domain vocabulary.

### Manufacturer partner — an RBAC exclusion, noted here only to close it

Not a persona this feature serves. `hasAssignedRole` already refuses them
(`worker/lib/staff.ts:150`). Recorded because the consequence is sharper on this
screen than anywhere else in the console: it exposes which competing products
were considered and how they compared, so a manufacturer partner reading it
would be a genuine competitive leak. The existing gate closes it. Nothing may
loosen it.

## 2. What the screen is

**R1 — An audit and reading surface. Read-only.** No product switching from
here (*"No need to switch products directly from this screen"*). "Change the
product" remains a link out to the editor.

**R2 — Not a verdict-recording surface.** The existing
`PATCH /api/ops/recommendation-outcomes/:id` (approve/reject + `thermalTarget`
correction, `src/ops/api.ts:342-355`, never wired to any UI) does **not** get its
screen here. The owner's reasoning is the load-bearing part and must survive into
the copy: *"products can be chosen to be changed for various reasons by a human…
that does not imply that the initial thermally-derived recommendation is
wrong."* Nothing on this screen may frame a human override as a machine error.

**R3 — A snapshot, never a live recalculation.** *"this screen should be based on
a snapshot rather than live recalculation."* It reports what the platform
decided at selection time. The catalogue may have moved since; the line may have
been edited since. Neither changes what is displayed about the recommendation.

## 3. Content rulings

**R4 — The requirement is stated as a fact; its origin is a label.** *"product
has a thermal requirement. period. where was it derived… is a separate data
point. worth a label perhaps."* Three origins, in the owner's vocabulary:
parsed from an energy report · modelled by the platform (plan-based) · a default
value. (`RequirementBasis`, plus `human_override`.)

**R5 — No certification anywhere on the screen.** *"products have a single
source! That's in their thermal properties."* If Uw and SHGC exist, that is what
selection needs. See §5 — the flag is being removed outright.

**R6 — The panel on the line detail keeps its three lines:**

> **Had to meet** — the caps, with the origin label
> **This one** — the chosen product's figures
> **Chosen** — why it won

**R7 — The 5% tolerance band is named on screen, not paraphrased.** When nothing
meets the target, say the rule: *within 5% of the closest*, not "closest
available". A reviewer who cannot see the band cannot report that it is set
wrong — and "closest available" is what the deleted model falsely claimed to do.

**R8 — The alternatives list is the chosen product plus 3–5 next best, by ladder
rank. No count of anything beyond it.**

**R9 — Excluded candidates are NOT shown. At all.** *"i'm not interested in, nor
ever asked for, excluded in the first place. only 3-5 next best options."* This
supersedes the round-2 answer on disclosure tiers. `withheldIncomplete` follows
the same ruling unless the owner says otherwise — **flagged as an open
assumption, §7.**

**R10 — No price deltas on the alternatives.** Follows from R3: stored candidate
prices are run-time snapshots and would be stale.

**R11 — When a human has changed the make-up, show both.** The original platform
recommendation stays, unchanged, and a comparison of the human's selection
against the requirement is added beside it. *"In case product has changed, it
might be therefore appropriate, to add comparison of the properties of a human
selection vs requirements, but keep the original platform recommendation
still."*

**R12 — What counts as "changed": frame or glazing.** *"product, from a thermal
standpoint, is a frame + glazing, as the combination of that gives a set of
thermal properties… Therefore changing any of that constitutes to human decision
scenario."* The owner also notes frame choice is itself constrained by min/max
size and by split rules (matching products, compatible families) — those rules
are already in the code and are not re-derived here.

**R13 — Lines with no selection run show the panel too**, stating that a person
chose the product, with the product's own figures and no target. Human picks are
*"expected to be a rare case"*. Option (a) of three offered: the project-level
band is **not** shown as a substitute, and a band is **never** computed live for
an opening the engine never evaluated.

## 4. Composites

**R14 — The panel appears on machine-proposed composites.** The mock's rule
(*"THE WHY PANEL DISAPPEARS ENTIRELY"*) is void: *"The platform can recommend
splits automatically… so thermal requirements per opening is very much relevant
for platform-recommended composite products."*

Verified in code, 2026-08-24:
- `materialiseSelectedSplit` (`estimate.ts:360-395`) builds the composite on the
  **same `quote_line`** as the opening, stamped `origin: "ai"` — so the parent
  still resolves to its `selection_run` and full candidate set.
- Split make-ups compete in the same ladder as single units (`form: "split"`,
  `units[]`), and `select.ts` exports `parentRepresentative()`, commented as
  *"the honest runner-up to show beside a split."*
- `splitNote` records the case where a make-up was tried and nothing could
  supply it.

**R15 — Both halves are shown**: the split reason first (the make-up that won and
the single unit it beat), then each lite's own band.

**R16 — Per-lite thermal bands are real and currently invisible.**
`segment_requirements_json`, `segment_requirement_basis`,
`segment_thermal_review` (migration 0036) are written on every split by
`composite.ts:297` and **read by nothing, anywhere.** The migration header calls
itself a scaffold; the live call path populates all three. An awning lite at
0.37–0.41 beside a fixed lite at 0.50–0.56 has never appeared on a screen.

**R17 — An ops-created split (`composite_origin = 'ops'`) follows R13**: a person
decided it, and there is no machine rationale to show.

## 5. In scope: remove `certified` entirely

Owner ruling: *"separately, remove certified as part of this change."* Depth
**(c)** — code, studio schema, **and** the values in the documents.

**Why it is not cosmetic.** Measured against the live dataset, 2026-08-24:

| Path | Products | `certified` default | Line with a thermal target |
|---|---|---|---|
| `thermalProfile` (`catalogue.ts:164`) | 19 | coerced **true** | passes — unaffected |
| legacy `performanceVariants` (`:205`) | 13 | requires explicit `true` | **fails — status downgraded** |

Zero of the 25 products carrying legacy variants have a single variant passing
`isCertified`. So 13 of 32 products produce "indicative estimate only" lines
whenever a thermal requirement exists, and the other 19 do not — because
`sanity/schemaTypes.ts` gives the same dead flag **opposite initial values**
(`:460` `initialValue: false`, `:1201` `initialValue: true`).

**Call sites to clear:**
- `sanity/schemaTypes.ts` — `:459` (`dataSource` dropdown), `:460`, `:465-466`
  (the validation rule), `:1201`
- `worker/lib/estimator/catalogue.ts` — GROQ selections (`:63`, `:69`), the two
  mappings (`:164`, `:205`), and the **drop-guard at `:187`**, which removes a
  variant from the catalogue outright
- `worker/lib/estimator/select.ts` — `isCertified` (`:198`), the status branch
  (`:187`), `:424`
- `worker/lib/estimator/rules.ts:329` — `energyCertified`
- `worker/lib/estimator/splitCandidates.ts:359`
- `worker/lib/estimator/outcome.ts` — `:52`, `:252`
- `src/data/recommendation.ts` — `CandidateOutcome.thermal.dataSource`

**`certificationRef` / `wersWindowId` stay.** A WERS reference is a real fact
about a product; it simply is not a gate.

**Two constraints on the removal:**
1. **Export the Sanity dataset before stripping document values.** Depth (c) is
   an irreversible write against production. The repo already keeps
   `sanity/sanity-production-before-import.tar.gz` as precedent, and the D1
   lesson (`memory: d1-table-rebuild-cascades`) is the same lesson.
2. **Removing `dataSource` from `CandidateOutcome` breaks the contract's
   additive-only stability rule** (`src/data/recommendation.ts` header,
   design §3). The architect must rule explicitly: remove the field, or retain
   it permanently null. Do not decide this silently.

**R18 — History is left alone.** Lines already downgraded stay downgraded.
*"leave history"*. A status records a decision taken at a moment, and a bulk
rewrite cannot distinguish a downgrade caused by this flag from one a person
reviewed and deliberately left standing.

## 6. Presentation

**R19 — The detail is a right-hand slide-out**, not a full route — reusing the
panel established in the record work. *"slide out. the list does not need to be
long - i don't want a full catalogue sorted by match level. 3-5 products are
plentifull."*

**R20 — Same access gate as the record itself** (`hasAssignedRole` — everyone
except manufacturer partners). No narrower role.

**R21 — Clicking a drawing opens a full-screen view.** One shared viewer for
every drawing in ops2, not just this screen. On a composite, tapping a unit
shows that unit; tapping the parent shows the assembly.

## 7. Open assumptions — to be vetoed at review

- `ASSUMED:` `withheldIncomplete[]` (products held back because their catalogue
  record is unfinished) is **not** shown, following R9. It is arguably a
  different thing from an excluded candidate — the fix is the owner's, not the
  opening's — but it was not separately ruled on.
- `ASSUMED:` the `CandidateOutcome.dataSource` removal is resolved by the
  architect per §5 constraint 2.
- `ASSUMED:` "3–5 next best" is implemented as **4** runners-up beside the
  chosen product, giving five rows total.
- `ASSUMED:` the `CONTEXT.md` corrections in §1 are for the architect to apply.
  Correction 1 (Staff works for OpenFrame, not AMJ) is a direct owner ruling.
  Correction 2 (define "Manufacturer") is an inference from it and may be
  vetoed. Correction 3 was raised and **resolved as no-change**.

## 8. Raised, deliberately NOT folded in

**The staff role vocabulary is the same defect class as `certified`.**
`estimator | technical_reviewer | manager | admin` (migration 0010) — the owner:
*"i believe these are legacy/overengineered roles as well. i never asked for
them."* Only `admin` and `manufacturer` correspond to anything real. This touches
authorization across the whole console and must not ride along inside a
read-only display feature. **Own ticket.**
