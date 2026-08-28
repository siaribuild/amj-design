# The line surface is one shared core with two skins — and an admission rule at the door

Status: accepted (owner, 2026-08-20) · Follows the investigation in
`docs/design/ops2-line-surface-reuse.md` · Related: ADR 0005 (Ionic adopted),
`docs/design/ops2-ionic-boundary.md` (the component boundary this extends)

The owner chose Strategy C — "the more we can reuse/unify - the better. Single source of
maintenance, experience, bugs" — with one caveat that decides the whole shape: "if we're
committing to Ionic/whatever for ops to optimise mobile workflows - we can't blindly
compromise that." Those two requirements reconcile only if the seam is cut between **what
is shared** and **how it is drawn**. Decision: **one shared core — line facts, arithmetic,
labels, adapters — consumed by two thin skins that each own their chrome.** The customer
app keeps its face (Tailwind/Radix); ops2 keeps Ionic. B and C were the same road: B's
engine-sharing *is* the core; C is that core given a package boundary. So we share by
import now and extract when the dev lines merge — nothing done now is wasted.

## 1. The admission rule

A shared core with no doorman becomes a dumping ground, and in a year something
presentational in there forces a compromise on one skin. The rule below is applied by the
developer without asking, in the shape of the boundary document's disqualifier list.

**A module may enter the core only if ALL four hold:**

1. **It states or computes a fact about a line** — a type, a predicate, a label
   derivation, arithmetic, a DTO adapter. Never how a fact is drawn, opened, animated,
   or interacted with.
2. **Both skins consume it** — today, or by an obligation already on the carry-across
   register. A helper only one skin wants is that skin's helper.
3. **It imports none of:** `react-router*`, `@ionic/*`, `@radix-ui/*`, `lucide-react`,
   any `.css`, any skin module, any store, any fetch client. React itself is permitted
   (a context with a working default — `GstContext` is the precedent); DOM event
   handling is not.
4. **The two skins could not legitimately disagree about its output.** This is the
   borderline test, and the only one needed for a hard case: *if ops and the customer
   showed different results here, would one of them be wrong?* Wrong = a fact = core.
   A defensible audience difference = judgement = skin.

**The presentation exception, named and closed.** A React component enters the core only
when its rendered output *is* the fact (an SVG drawing of the line), it passes rule 3,
and its entire style surface is a declared token contract (`--paper`) plus stable
class/data hooks each skin binds in its own stylesheet. `Elevation` and `FamilyPictogram`
are admitted under this clause. No new component enters by analogy — it meets the tests
or stays in a skin.

**Grandfathered, not core, not a precedent.** `ItemForm` is shared *by mandate* (register
row 95; ops1 precedent at `ProjectRecord.tsx:1395/1489`) but is skin-built — Tailwind,
lucide, customer chrome. It stays in the customer skin and is consumed cross-skin via the
`LineEditor` wrapper and the compat shim, exactly as ADR 0005's boundary doc designed.
Its existence does not admit any future component the same way; new cross-skin sharing
goes through the rule above.

### The hard cases, ruled now so nobody re-litigates them

- **`rowStateFor` — skin, twice; its predicates — core.** The mapping from facts to
  chips is audience judgement and the two audiences are near-inverse: the customer
  triage suppresses technical review (a service promise, explained once at submission);
  ops triage leads with it (it is the work). One shared mapping with an `audience`
  switch would be two functions hiding in one body — the exact smell the rule exists to
  stop. Core keeps the facts both mappings read: `lineBlocksSubmission`, `severityOf`,
  `missingRequiredOptions`, `acrossMismatch`, `compositeAcrossFault`, the coverage
  delta/tolerance. Each skin writes its own mapping over them; fact drift becomes
  impossible, judgement drift stays legitimate.
- **`hydrateQuoteItems` and `hydrateOpsLines` — core.** The DTO→line-model boundary is
  a fact-preserving translation ("one line model" was fought for once already —
  `accountModel.tsx:175-181`). Transport stays per-skin: the fetch clients, endpoints
  and error vocabularies (`ApiError` vs `OpsApiError`) genuinely differ.
- **Chip vocabulary — fault identities and their sentences core; admission and
  prominence skin.** The codebase already holds this rule at one scale: an opening and
  its unit say the same words about the same fault (`rowState.ts`, `UnitRow.tsx`). This
  extends it across surfaces: `Check size` names the same geometry failure to staff and
  customer, so the fault kind and its canonical sentence live once. *Which* faults a
  surface shows — the customer record hides chips entirely; the ops list leads with
  `needs review` and `no rate` — is each skin's call. This is precisely how read-only
  `OpeningList` drops what the ops skin must show, without either being wrong.
- **Split/merge planner arithmetic — core; the split panel — skin.** The client-side
  even-split proposal must equal the server's `proposeEvenSplit` (the ops1 console once
  drifted by ignoring the joiner allowance — recorded in `ProjectRecord.tsx`'s
  `SplitPanel`). The arithmetic is one function; the panel that hosts it is chrome.
- **Unconditionally core:** `unitLabel` (W1A/W1B), `compositeUnitCount`,
  `optionFullPairs`/`optionSummaryOf` (the glazing-first and standard-inherited rules),
  `sizePhrase`/`mm`/`compositeLabel`/`productLabel`, GST arithmetic (`gst.ts` — already
  the single source), catalogue selectors.

## 2. How each skin consumes it

**Plain functions and types first.** A hook is admitted only when it depends on React
alone — `useGstMode` qualifies (context, default `"inc"`, each skin provides its own
value). No hook in the core may wrap a router, a store, or a fetch. Components: only the
two named SVG exceptions.

**The property is made law, not luck.** Today the zero-`react-router` state of
`src/components/**` and `src/data/**` is verified but accidental. `ops2-deps.test.mjs`
assertion 3 (boundary doc §2.4) already asserts router-freedom for the reuse allowlist;
it extends to the full banned-import list of rule 3, and re-targets to the package path
at extraction. A core module that grows a banned import fails the battery, not a review.

## 3. Extraction — now, later, and what it will really cost

**Now (dev lines unmerged — relocation stays rejected, boundary doc §8 stands):** share
by direct import from current homes. New core-shaped code lands in `src/data/` — already
the designated shared-types home, already router-free-asserted, already in the reuse
allowlist. `hydrateOpsLines` and any predicate extracted for ops2's triage mapping start
there.

**Later (one bounded PR, after the referral branch merges):** create the package home
(`src/core/line/` or similar — named at extraction, not now) and move:
`Elevation.tsx` + `FamilyPictogram.tsx`; the pure half of `rowState.ts` (`unitLabel`,
`compositeUnitCount`); the domain half of `configurator.ts` (types and predicates split
out of the `QuoteState` store contract — the entangling file); `hydrateQuoteItems` split
out of `src/data/api.ts`'s transport; `optionFullPairs`/`optionSummaryOf` out of
`ItemComposer.tsx`. Estimated cost: 15–25 files of import churn, no behaviour change,
full battery + typecheck as the gate, re-export shims from the old homes for one release
then a codemod sweep.

**What could make it painful, said plainly:** the two entangling files
(`configurator.ts`, `ItemComposer.tsx`) are exactly where the parallel production thread
ships daily. That is the whole reason for the timing rule — the move is rename-only, done
in a quiet window after merge, never interleaved with feature work in the same files.

## 4. Explicitly NOT unified — "single source" is not licence to merge the faces

- **`OpeningDrawer` never crosses.** It *is* the customer editing contract — Radix host,
  customer store writes, review-key hygiene, and the baked-in rule that units can never
  be added or removed, which is the exact power ops must have. Its conventions (the
  520px cap, dirty-guard semantics, Escape precedence) may be mirrored; the component
  may not.
- **The list rendering layer stays per-skin.** `OpeningList`/`OpeningRow`/`UnitRow` are
  the customer skin; ops2's list is Ionic. Both draw the same core facts.
- **`MoreMenu`, `ProjectActionBar`** (customer action grammar) and **`PriceCell`,
  `SplitPanel`, the AI-configuration block** (ops action grammar) stay where their
  audiences are.
- **Price stays outside `ItemForm` on both skins** — the standing rule, restated so the
  core never grows a price input.

## 5. What the owner gets, and does not

**Gets:** a split-arithmetic bug fixed once, on both surfaces and against the server, by
construction. W1A meaning the same frame on a customer screen, an ops screen and a phone
call. Option summaries, geometry faults, GST and coverage arithmetic computed by one
implementation. One line model from D1 to either screen.

**Does not get:** pixel-identical rendering — which he has said twice he does not want
for ops ("that's a separate platform/audience"). And not automatic interaction parity:
how a fact opens, expands, or edits is each skin's decision, made against its audience.

## 6. One seam constraint from the same conversation

The owner, on mobile: information should **open as a panel rather than expand within the
list** — and *"that would probably be a good thing to do in customer end as well."* That
is a future change to a shared behaviour, so the seam is drawn now to keep it cheap:
**inspection content stays pure-prop** (`SpecPanel`/`CoverageNotice` shape — data in,
markup out, no knowledge of how it was opened) and must never fuse into the disclosure
machinery (`OpeningList`'s `openedKeys`/`.disclose` layer). Then moving the customer list
from inline expansion to a panel is a host swap, not a content rewrite — and ops2's
panel-first idiom is already on the right side of the seam.
