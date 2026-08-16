# ops2 — the staff operations console, rebuilt

Branch: `design/ops2-planning`
Status: **revision 1 — governing spec. Decisions needed: 5 (§16).**
Author: product-manager (pipeline stage 1)
Date: 2026-08-17

## Inputs, and their standing

| Input | Standing here |
|---|---|
| `docs/ops-redesign/GRILL-CONCLUSIONS.md` | **Binding.** Pipeline stage 0, seven rounds with the owner. D1–D19, C1–C8, §1 actors, §6 deferrals, §9 verified facts, §10 rejections. Where anything else disagrees, this wins. §1 is carried into §3 below **verbatim**. |
| `docs/ops-redesign/UX-SPEC.md` **§B.4, left column only** | **Factual.** 291 rows describing the console that exists **today**. This is the basis of the completeness contract (§8). |
| `docs/ops-redesign/UX-SPEC.md` **§B.4 right column, §A, §C–§G, `UX-AUDIT.md`, `README.md`, `mocks/`** | **Exploratory. Not a rule set.** Owner: *"that is not a set of instructions to follow. It is a good representation of what ops need to be able to do."* Mined for capability, never for rules, layouts or numbered rules. Not validated functionally — they were never built against real data. |
| `docs/specs/referral-program.md`, `docs/design/referral-program-ux.md` | **Requirement source for §13.** In flight in the legacy console right now (D17); the requirement set may still move, and §13 says how that is handled. |
| `CONTEXT.md` | Domain vocabulary. Terms it lacks are flagged in §14 for the architect. |

**Two things this spec refuses to get wrong, stated up front because they are the two that get assumed wrong:**

1. **The estimator is not authoritative.** Its purpose is to spare a human work. A human overrides anything. **No screen may block, gate, or demand justification for a human decision** (C4, §3 of the conclusions). Warnings may exist only if unobtrusive. Recording happens **once per quote, at issue** — never per save, never per line (C5).
2. **Cloudflare Access and MFA are unchanged by this project** (C8). Access answers *who you are*. RBAC answers *what you may do*. D5 replaces domain-based **role assignment**, not authentication. Nobody reaches ops2 without passing Access first, exactly as today.

---

## 1. Problem statement

The staff operations console is where two founders do every operational job in the business: reviewing what the estimator proposed, consulting the customer, negotiating manufacturer pricing, maintaining the catalogue and rate cards, and handling enquiries. It is 4,322 lines across 8 files, concentrated in two of them (`ProjectRecord.tsx` 1,690 lines, `Pricing.tsx` 1,346). Owner: *"Current ops console is a mess. […] it was never designed from UX perspective."*

Three failures cost the business money rather than patience:

- **It cannot be worked from a phone.** The desktop rail is 224px on a 375px screen; the Pricing surface is explicitly unhandled below `md`. So a request that arrives during the day waits until someone is at a desk. The owner's framing of that cost: *"Responsiveness is everything, speed is money. We can't afford waiting the whole day to open the request in the evening — that's the day lost as we would be able to follow-up with questions and contacting manufacturer only the next day."* One glance deferred is one working day lost, because both the customer follow-up and the manufacturer call slip past the point where either can happen that day.
- **The machine's reasoning is not on screen.** `candidate_result` holds **3,989 production rows** — every product × variant evaluated, with per-filter pass/fail, a human-readable reason, six score components and a rank — and **no ops endpoint reads a single one**. `GET /projects/:id/building-model` is implemented, typed, and has **zero callers**. The reviewer is on the phone with a customer asking *"why that one?"* and *"why not the cheaper one?"*, and the answers are in the database, unread.
- **It obstructs where it should assist, and is silent where it should speak.** Failures land in a page-level error strip rather than at the thing that failed; several code paths have no `catch` at all, so a failed write is indistinguishable from a successful one.

**ops2 is a ground-up rebuild** (D1) — structure and finish both — that replaces the console and is then deleted from behind (D2), carrying every capability that works today across with it (C7).

---

## 2. Non-goals

ops2 does not change what the business does. It changes the instrument the business is done with. Specifically: no pricing arithmetic changes, no GST arithmetic changes, no quote lifecycle changes, no new order stages, no customer-facing change of any kind, and no change to the Cloudflare Access perimeter. See §6.

---

## 3. Actors and their needs

Carried verbatim from GRILL-CONCLUSIONS.md §1, which the owner has confirmed accurate. Quotations are his own words. Nothing in this section is inferred, and nothing has been added to it.

### 3.1 Founder-operator (×2) — the only actor today

> "OpenFrame at the moment is two-men show, both founders, both super-admin type users."

Two people, both with unrestricted access, performing every operational task between them: reviewing machine output, consulting customers, negotiating manufacturer pricing, maintaining the catalogue and rate cards, handling enquiries. No division of labour by role — the same person is reviewer and catalogue maintainer on different days, often within the same hour.

**What they need, and why:**

- **To not lose a day.** The governing constraint of the entire project:
  > "Responsiveness is everything, speed is money. We can't afford waiting the whole day to open the request in the evening — that's the day lost as we would be able to follow-up with questions and contacting manufacturer only the next day."

  The cost of a delayed glance is not inconvenience; it is a working day, because both the customer follow-up and the manufacturer call slip past the point where either can be answered that day.

- **To work while moving, on any device, at any width.** Many activities run in parallel; the console is used between other tasks, one-handed, on both iOS and Android, and on a foldable *held open with other apps beside it*:
  > "use it open with apps running in parallel. it's a workhorse!!"

- **To conduct a consultation, not to file records.** The estimator's output is the beginning of a conversation, not a document to approve:
  > "We are not expecting customer to know our products. We are not expecting anyone to commit to buying products worth thousands of dollars without detailed consultation and review whatever they submitted. It is an interactive process of calling the customer, finding their needs, preferences, explaining product nuances. Then talking to manufacturer to get their final pricing set. It therefore can involves changing any parameters, any options, including pricing."

- **To have the machine's reasoning on screen, ready to consume.** Not retrievable — present:
  > "we don't want, for example, to open pdf with building drawing and search for Uw value — it should be on the screen, ready for consumption."

- **To remain the authority.** The human overrides; the system never obstructs.

- **To be able to hand the tool to someone with no training.** The quality bar, figuratively stated:
  > "we aim for 'even my mum could do it' quality"

### 3.2 Limited-access staff — designed for, not yet hired

Growth is intended, and the permission model exists to serve it:

> "identity has to move to RBAC, per user. This will also set foundation for future hires with limited access. For example, having someone to review quotes but not to have admin accesses, etc."

**Need:** to perform one part of the job — reviewing quotes — without inheriting administrative reach over pricing, catalogue or users.

### 3.3 Manufacturer partner (AMJ) — phase 2, boundary designed now

The showrooms are the manufacturer's. Requests for physical inspection are currently forwarded to them by email:

> "the showroom are owned by manufacturer, and requests for physical inspection need to be passed through to them. We are forwarding email notifications on requests, but we though it would be so much more easier for them to login and update status on what has happened. […] it also just access/visibility feature — they need to be able to see a single working area, not the rest."

**Need (phase 2):** to see the appointment/inspection requests that concern them, and to record what happened — nothing else. A later ambition, explicitly raised when deep links were discussed, is direct price maintenance:

> "if we could get manufacturer on board to use the platform to update pricing directly […] no more sending out emails/pdfs, no more manual reconciliation!"

**Not a customer of the platform. No multi-tenancy.** Access is internal, by identity, for people the founders choose to admit.

### 3.4 The customer — present but not a user

The customer never signs into ops. They are, however, **on the phone while the console is being operated**, and their questions set the pace. Design consequence: the reviewer must be able to answer "why does it say that?" and "why not the cheaper one?" without leaving the screen, and to change what they are looking at while the customer listens.

---

## 4. The thesis — what ops2 is an instrument for

Carried from GRILL-CONCLUSIONS.md §2, because it is the frame every acceptance criterion below is written against.

The brainstorm proposed: *ops adjudicates machine output against source, one line at a time, then releases.* **That is too passive.** Edits happen with the customer on the phone:

> "change while on the phone. Recalling what was said discussing an order from 20-lines of products — that's a tough one to do. Taking notes — that requires another device or notebook."

> "One cannot adjust anything without gathering information and requirements, which is what consultation (or questioning) is for."

Adjudication is real, but it is performed conversationally and **its normal outcome is a change, not a tick.**

**Four load-bearing consequences**, each of which becomes a criterion in §9:

1. Edits fast enough to keep pace with speech.
2. A total that moves as options change.
3. Trivial reversal when a customer changes their mind back — and *trivial* means **not dependent on the operator's memory**, since the quoted difficulty is exactly recall across twenty lines.
4. Per-line comments captured while the reason is still in the room. (Per-line comments already exist in the data model and are used; `comment.line_id` is never written by the current UI.)

---

## 5. The governing invariants

Eight properties that every region of ops2 must hold. They are not features; they are the conditions under which any feature is acceptable. Each has criteria in §9.

| # | Invariant | Source |
|---|---|---|
| **I1** | **Human authority is absolute.** No blocking gate, no required justification, no acknowledgement ceremony, on any human decision. Warnings only if unobtrusive. | C4, §3 |
| **I2** | **Recording is quote-level, at issue, once.** Never per save, never per line. Internal only — no customer-facing note. | C5, D19 |
| **I3** | **Full capability parity at every width.** Everything works on a phone; the narrowest target is the folded cover screen. | D3, C1 |
| **I4** | **Neither failure mode.** No mobile app stretched across a desktop; no cramped desktop crushed onto a phone. Layout responds to the **width actually given, moment to moment** — never to device class. | D4, C1 |
| **I5** | **Conversation pace.** Edits, totals and reversals keep up with speech. | C3, §4 |
| **I6** | **Failure is loud.** Connection loss and every rejected write are surfaced at the thing that failed. Nothing fails silently. Offline editing is not required. | D15 |
| **I7** | **Two gates, not one.** Cloudflare Access admits the person; a granted role admits the capability. Neither alone is sufficient; revoking either locks someone out. | C8, D5 |
| **I8** | **Nothing that works today disappears silently.** The carry-across register (§8) is the instrument, and it is a hard gate on switch-over and on deletion. | C7, D18 |

**I4 has a consequence the rest of the spec does not soften.** D3 is categorical — *"everything works on the phone"* — so a surface that renders "this needs a wider screen" fails it. The exploratory UX-SPEC proposed exactly that for the rate-card editor (its row 269). **That proposal is void.** The rate-card editor is the hardest width problem in the console and it is in scope at the narrowest target. This is stated here rather than negotiated later.

---

## 6. Scope

### 6.1 In scope

1. **All eight of today's surfaces**, rebuilt: dashboard, projects, customers, enquiries, pricing, files, audit, admin — reorganised as the design stage decides, with every capability in the carry-across register accounted for.
2. **The record** — project and order as one plane: identity, phase, actions, lines, the line editor, composites/split/merge, notes, files, history, payments.
3. **The derivation surface** (D8) — origin, reasoning, extracted text, the requirement derived, the candidates considered. **Including the endpoints that must be added to serve it** — see §6.4.
4. **Losing candidates, ranked, with reasons, one tap away** (D9).
5. **RBAC, per user** (D5), replacing domain-based **role assignment** — with the domain path kept alive additively through soak (§12).
6. **The "with manufacturer" state** on the work, visible in the queue and on the landing page (D10). Not a messaging system.
7. **Deep links to every record and every line** (D11).
8. **The landing page as an attention surface** (D12), not a metrics dashboard.
9. **Record-scoped Audit and Files, with the global lists retained** (D13).
10. **Installability — add-to-home-screen** (D14). Not an App Store / Play Store app.
11. **The referral program's ops requirements**, carried across from the legacy build (D17, §13).
12. **Switch-over, the soak fire escape, and deletion** as three separate events (D2, C7, §12).
13. **The carry-across register** (§8), created, discharged and closed.

### 6.2 Out of scope — deferred to phase 2 or later

Directly from GRILL-CONCLUSIONS.md §6:

- Manufacturer login and their single working area (appointment/inspection status). **The boundary is designed and enforced now; the surface is phase 2.**
- Manufacturer direct price maintenance.
- Live presence — "X is looking at this now" (D16).
- Push notifications — deliberately deferred until the console has been used for a fortnight, so *"what is worth interrupting me for"* is decided from experience. Installability (D14) is what makes iOS push possible later.
- Extractor work to emit page number, sheet reference and region geometry. Its own feature with its own justification, **never a dependency of this redesign**.
- Offline editing with conflict resolution — explicitly not wanted (D15).

### 6.3 Out of scope — permanently, or by another thread

- **Any change to Cloudflare Access, its policy, or MFA** (C8).
- **A new hostname for ops2.** Ops is served by host prefix; Access protects that hostname and the Worker verifies a single `ACCESS_AUD`. ops2 on the **same host** under a path prefix needs no Zero Trust change and no edit to the authentication path. A new hostname would require a new audience, a list-valued `ACCESS_AUD` and widening `isOps` — security-path changes for a cosmetic reason.
- **Multi-tenancy, ever** (C6).
- **Any customer-facing change.** No customer surface, response body, email or price moves because of ops2.
- **Any change to pricing arithmetic, GST arithmetic, delivery zone pricing, quote lifecycle states, or order stages.** ops2 observes them; it does not extend them.
- **Region rendering over drawings** — rejected (D8, §10): the data does not exist, and the model is wrong regardless because provenance spans multiple pages.
- **A parallel-running transition** — rejected (D2).
- **Building RBAC into the legacy console first** — rejected (D5).
- **The trade account request form** — a separate thread (referral spec D19, option c). ops2 does not build it.
- **An order Cancel control.** No cancel endpoint exists; recorded so nobody designs the button.

### 6.4 Scope the conclusions create that the exploratory documents did not

**This is the single largest consequence of the conclusions overriding the mock, and it must not be lost.**

The exploratory UX-SPEC resolved `candidate_result` by *stating its absence on screen* — "the candidate evaluation is recorded but no endpoint reads it" (its rows 283–284). **D9 is binding and says otherwise:**

> "the customer, home owners in particular, might want to save money and choose the next-worse solution that is cheaper despite marginally failing to meet requirements."

Losing candidates are **shown, one tap away, ranked, with reasons**. The data is there — 3,989 rows in production, carrying exactly rank, reason and per-filter pass/fail. **The conclusions win, so ops2 adds the read endpoint.** Likewise `GET /projects/:id/building-model`, which exists and has zero callers, is called by ops2.

What genuinely stays *unwired and stated* is only what has no data behind it, verified against production: `evidence_items.page_no`, `sheet_ref` and `region_json` are **NULL on all 1,000 rows** because the extractor never produces them (the write path binds real values; the producer does not). D8 covers this exactly: **the absent visual is stated, not blank.**

---

## 7. Sizing judgement — decompose, but do not wayfind

`CLAUDE.md` asks me to flag when an ask is too large for one monolithic spec and should instead be charted with `mattpocock-skills:wayfinder` — a map issue whose children are decision tickets, resolved one at a time. **My call: the effort must be decomposed, and the wayfinder route is the wrong instrument for it.** Both halves argued.

**Why one monolithic spec would fail.** Eight surfaces, 291 carry-across rows, an RBAC model with a schema change and an endpoint-by-endpoint authorization sweep, a new estimator-transparency read path, a responsive system that must satisfy two contradictory-sounding constraints at once, and a PWA. No single testing pass can walk those acceptance criteria; a spec whose criteria cannot be walked is not an acceptance instrument, it is a book. And the pipeline's decision gates would batch questions across regions that have nothing to do with each other.

**Why wayfinder is nonetheless the wrong shape.** Wayfinder exists for an effort whose *route is not visible* — foggy, with an open frontier of unresolved decisions. **Stage 0 already did that work and emptied the frontier**: 19 decisions settled, 8 constraints fixed, the conclusions document closing with *"The frontier is empty. No decisions remain outstanding."* Generating decision tickets now would produce tickets asking questions the owner has already answered, at a real cost in his time and mine, to manage a risk that no longer exists. The owner's standing guidance is explicit on this point:

> "Let's just build the best one from the get go, and I will be a judge and a guide along the way." … *Do not spend effort hedging against hypothetical better versions of the work, and do not design process to manage that risk.*

**So: this document is the spine, and the build is decomposed into eight regions.** The spine owns the actors, the invariants, the scope boundary, the abuse cases and the carry-across register — because **coherence is the entire point of the rebuild and it is the one thing that cannot be delegated to eight independent regions.** The console being replaced is what happens when each surface is decided locally. Each region then runs the full pipeline as a normally-sized feature, inheriting §5 and §8 unchanged and adding only its own design.

**Tracker use.** One tracking issue on `siaribuild/apertly` with the eight regions as sub-issues, so the register is discharged in public and progress is visible without reading eight spec documents. It carries the region list, not decision tickets — the `wayfinder:map` label does not apply and would misrepresent what it is.

### 7.1 The regions, and their order

D7 fixes the first: *"Workplace first; we won't switch until everything is done though."*

| # | Region | Contains | Why here |
|---|---|---|---|
| **R1** | **The frame and the record** | The responsive layout system; hash routing and deep links (D11); boot, brand, sign-in, error boundary; loud-failure handling (I6); the record — identity, phase ribbon, action bar, line table, line editor, composites, split/merge, save. | **D7.** Also the tracer bullet: sign in → open a record → change a line → watch the total move → issue. It is the thinnest slice that proves I3, I4, I5, I6 and I1 all at once, and the only honest place to discover that the layout system does not work. |
| **R2** | **Identity and permission** | RBAC per user; role assignment moved off email domain; per-endpoint authorization; the staff administration screen; the additive migration; the rollback drill. | Second, so **every region after it is built against the final gate** and the abuse battery in §10 is executed once against a stable surface rather than re-run after each new screen. R1 ships against the existing role resolution, which stays live regardless (§12). |
| **R3** | **Derivation** | The derivation surface (D8); losing candidates ranked with reasons (D9); the `candidate_result` and `building-model` read paths (§6.4); thermal audit; learning/teach; evidence; the divergence record at issue (I2). | The record's other half, and the highest-value unmet need in §3.1 — *"it should be on the screen, ready for consumption."* Depends on R1's record. |
| **R4** | **Work** | The landing page as an attention surface (D12); the merged queue and its saved views; the "with manufacturer" state (D10); global search. | The front door needs records to point at, so it follows them. |
| **R5** | **People and archive** | Customers, enquiries/leads, the global Files list, the global Events list, record-scoped Files and Audit (D13). | Independent of R1–R4 once the frame exists; sequenced here because R6 is harder. |
| **R6** | **Catalogue and commerce** | Products, rate cards, options, the worked-example trace, reconciliation, Settings (Commercial, Policy, Catalogue, Staff-facing policy). | **The hardest width problem in the console** (I4's consequence) — it benefits from the layout system being proven across five prior regions. |
| **R7** | **Referrals** | The referral program's ops requirements, re-satisfied in ops2 (§13). | Sequenced after the legacy referral work settles, so the requirement set is stable when it is carried (D17). |
| **R8** | **Installable, switched over, deleted** | Installability (D14); the switch-over deploy; the soak fire escape; the deletion commit (D2, C7, §12). | Last by definition. |

**R1 does not exit design review until the carry-across register exists and every one of its rows is assigned to a region.** That is what stops region 7 discovering that nobody owned rows 233–272.

---

## 8. The completeness instrument — the carry-across register

D18 gives quality to the owner: *"I will be accepting that and I consider myself competent in UX."* That is his to judge, and this spec does not attempt to score it. **What this spec carries instead is completeness**, and completeness needs an instrument that can fail.

**The register** is a table with one row per capability that exists in the console today. Its rows come from **`UX-SPEC.md` §B.4's left column only** — the 291-row inventory of current behaviour, which is factual. Its right column (the exploratory proposal of where each lands) is discarded, along with the rest of that document's rules.

Each row carries: the capability, its verbatim copy where copy is part of it, its region, its state, and — where dropped — the owner's decision.

**States:**

| State | Meaning | Evidence required |
|---|---|---|
| `CARRIED` | The capability exists in ops2 and has been exercised. | The tester performed it in ops2 and recorded the result. |
| `REPAIRED` | The capability exists, and a defect in it was fixed. The capability is still there. | As `CARRIED`, plus the defect demonstrated absent. |
| `RESTATED` | Data or a limit that today is silent or invisible; ops2 states it in words instead of showing it. | The sentence is present on the named screen. |
| `DROPPED` | Deliberately not carried. | **An owner-visible entry naming what is lost and why. Nothing may be `DROPPED` without the owner seeing it.** |
| `DEAD` | Unreachable code today — not a capability. Removal is not a loss. | Proof of unreachability (no call sites / no route). |

**Not carry-across obligations, recorded separately so they are not re-discovered as gaps:** §B.4.15 (endpoints that reach no pixel today), §B.4.16 (persisted data with no reader). These are not capabilities today, so losing them is not a regression — but §6.4 promotes two of them into scope deliberately.

**The register is a gate, twice:**

- **Switch-over may not happen while any row is unaccounted for** — every row in one of the five states, and every `DROPPED` row seen by the owner.
- **Deletion may not happen while any row is `CARRIED`/`REPAIRED` but not yet exercised on real work.** Owner's basis for deletion is judgement, not a fixed soak (O2 closed) — but the register says what he is judging.

---

## 9. Acceptance criteria

Every criterion is Given–When–Then and independently verifiable. `[Rn]` marks the region that owns it; `[all]` means every region is tested against it. The **negative criteria are in §10** and are verified by attempting the forbidden action, not by inspection.

### 9.1 Human authority (I1)

- **AC-1** `[R1, R3]` **Given** a line whose selected configuration diverges from the estimator's proposal or fails a derived requirement, **when** staff save the line, **then** the save succeeds, the chosen values persist, and no confirmation step, justification field, acknowledgement checkbox or second click is required.
- **AC-2** `[all]` **Given** any divergence between an estimator proposal and a human decision, **when** the screen renders, **then** any warning shown does not take keyboard focus, does not appear in an element with `role="dialog"` or `role="alertdialog"`, does not disable the primary action, and does not require dismissal before the work can continue.
- **AC-3** `[R3]` **Given** the losing candidates for a line, ranked with reasons, **when** staff select a candidate the estimator ranked below its own selection — including one that marginally fails a requirement — **then** it is selectable, it saves, and the line prices on it.
- **AC-4** `[all]` **Given** any ops2 surface, **when** the full set of controls is enumerated, **then** no control is disabled, hidden or made conditional on a human agreeing with the estimator.
- **AC-5** `[R3]` **Given** the derivation surface, **when** it renders estimator output, **then** that output is labelled as a proposal, and no copy presents it as a decision, a requirement or an approval.

### 9.2 Recording at issue (I2)

- **AC-6** `[R3]` **Given** a quote of three lines, two of which diverge from the estimator's proposal, each edited five times, **when** every edit is saved, **then** **no** divergence record is written by any save.
- **AC-7** `[R3]` **Given** that same quote, **when** it is issued, **then** exactly **one** divergence record is written for the quote, enumerating each diverging line with its proposed and its decided value, and no per-line or per-save record exists anywhere.
- **AC-8** `[R3]` **Given** a quote with no divergences, **when** it is issued, **then** a divergence record is written recording none, and it is distinguishable from a quote that was never issued. `ASSUMED:` an explicit empty record rather than no record — the absence of a record must not be ambiguous between "agreed with the machine" and "never issued".
- **AC-9** `[R3]` **Given** a quote issued, returned to pricing, and issued again, **when** the second issue occurs, **then** a new divergence record is written for that issue and the prior one is retained. `ASSUMED:` supersede-and-retain rather than overwrite.
- **AC-10** `[R3]` **Given** a quote with a divergence record, **when** any customer-facing response body, email or PDF for that quote is produced, **then** no divergence text, flag or count appears in it (D19).

### 9.3 Width, and the two failure modes (I3, I4)

- **AC-11** `[all]` **Given** the console at the narrowest target width (the folded cover screen), **when** each capability owned by the region is attempted, **then** every one is reachable and completable — including editing a rate card (R6) — and no surface presents "use a wider screen", hides a capability, or redirects to another device.
- **AC-12** `[R1, then all]` **Given** a browser window resized continuously from the narrowest target to full desktop width, **when** the width crosses every layout change point, **then** no in-progress edit is lost, no focused field loses focus, and no scroll position resets.
- **AC-13** `[R1]` **Given** a desktop browser sized to the narrowest target width and a phone at the same width, **when** the same screen is rendered on both, **then** the rendered layout is the same — layout is selected by available width alone. Verified additionally by the absence of any user-agent, platform or device-class branch in layout code.
- **AC-14** `[all]` **Given** a viewport of 1440px or wider, **when** a record is opened, **then** the openings list and the derivation content are usable simultaneously without navigating away from either, and no primary content column is confined to a phone-width measure. *(Aesthetic judgement of D4 remains the owner's under D18; this is the falsifiable floor.)*
- **AC-15** `[all]` **Given** the reference devices — a late-model iPhone and a Galaxy Fold 7, per C2 — **when** each region's criteria are walked, **then** they pass on both, on the Fold both folded and unfolded, and when the Fold is unfolded mid-task.

### 9.4 Conversation pace and reversal (I5)

- **AC-16** `[R1]` **Given** a line editor open on a reference device over a mobile connection, **when** staff change an option, **then** the updated line total and the updated quote total are both visible within **1200 ms at p95** from the input event. `ASSUMED:` the budget; the requirement that both totals move together is not assumed.
- **AC-17** `[R1]` **Given** staff have changed a field during a call, **when** the customer changes their mind back, **then** the value the field held before this editing session is **visible on the editing surface**, so restoring it does not depend on the operator's memory, and restoring it requires no confirmation.
- **AC-18** `[R1]` **Given** a record with twenty lines, **when** staff attach a comment to one line while the reason is still in the conversation, **then** the comment is stored against that line and is shown against that line thereafter.
- **AC-19** `[R1]` **Given** any editable line, **when** an option changes, **then** the quote total on screen reflects it without a page reload and without the operator navigating away.

### 9.5 Loud failure (I6)

- **AC-20** `[R1, then all]` **Given** an edit with unsaved values on screen, **when** the connection is lost and staff save, **then** an error is rendered **at the control that failed**, the entered values remain on screen, and no surface presents the unsaved value as saved.
- **AC-21** `[all]` **Given** any write in ops2, **when** the server rejects it, **then** the rejection is rendered with a sentence naming the cause; a rejected write never resolves without a rendered error.
- **AC-22** `[R1]` **Given** a failed save and restored connectivity, **when** staff retry, **then** the save succeeds with the values still on screen.
- **AC-23** `[R1]` **Given** a quote that another operator issued while this operator had the line editor open, **when** save is attempted, **then** it fails with a sentence naming the real cause — the quote is now issued — and offers a reload, rather than a generic failure or a silent 404.

### 9.6 Deep links (D11)

- **AC-24** `[R1]` **Given** a URL addressing a specific record, **when** it is opened cold in a browser with no ops session, **then** Cloudflare Access authenticates, and after authentication the same record opens — the target survives sign-in.
- **AC-25** `[R1]` **Given** a URL addressing a specific line within a record, **when** it is opened, **then** that record opens with that line in view.
- **AC-26** `[all]` **Given** any destination in ops2, **when** it is reached by navigation, **then** the address bar carries a URL that reproduces it, and the browser back control returns to the prior destination.

### 9.7 Permission — the positive half (I7, D5)

*The negative half is §10.2 and is binding on the tester as attempts.*

- **AC-27** `[R2]` **Given** a person admitted to the Cloudflare Access policy with **no role granted**, **when** they open ops2, **then** they are authenticated, every capability is refused, and the console states that they have no role rather than rendering an empty or broken console.
- **AC-28** `[R2]` **Given** a person granted a role that permits quote review and nothing administrative (§3.2), **when** they work, **then** they can open records, edit lines, change options and prices, and issue quotes; and every rate-card, option-pricing, catalogue-configuration and role-administration endpoint refuses them.
- **AC-29** `[R2]` **Given** an admin changes another person's role, **when** that person makes their next request, **then** the new role applies without them re-authenticating.
- **AC-30** `[R2]` **Given** the only remaining admin, **when** they attempt to remove their own admin role, **then** it is refused and the role is unchanged.
- **AC-31** `[R2]` **Given** a database with no admin at all, **when** a staff member signs in, **then** exactly one is promoted to admin — the existing lockout self-heal — and **given** any admin exists, **then** no promotion occurs.
- **AC-32** `[R2]` **Given** the manufacturer role, **when** it is assigned, **then** it is assigned **per user in ops2**, not derived from the email address, and a partner on an `@openframe.com.au` address is distinguishable from a founder.
- **AC-33** `[R2]` **Given** the RBAC migration applied to a copy of production data, **when** it is applied, **then** no row in any table is deleted, no `ON DELETE CASCADE` fires, and row counts for `order_line`, `payment`, `quote_line`, `referral*` and `user` are unchanged before and after. *(The `d1-migration-safety` skill is loaded before the migration is written; a clean local run proves nothing.)*
- **AC-34** `[R2]` **Given** the RBAC migration applied and the previous Worker version redeployed, **when** a founder opens the old console, **then** they authenticate, open a record, **and write to it** — authorization is verified, not just sign-in. *(The §12 rollback drill.)*

### 9.8 Completeness (I8)

- **AC-35** `[R1]` **Given** the carry-across register, **when** R1's design review concludes, **then** the register exists with one row per capability in `UX-SPEC.md` §B.4's left column, and every row is assigned to a region.
- **AC-36** `[all]` **Given** a region's implementation is complete, **when** the tester walks the register rows assigned to it, **then** every row is in one of the five states with the evidence that state requires, and no row is left unassigned or unevidenced.
- **AC-37** `[all]` **Given** a row moving to `DROPPED`, **when** it is proposed, **then** an owner-visible entry names what is lost and why, and the row is not closed until the owner has seen it.
- **AC-38** `[R8]` **Given** the register, **when** switch-over is proposed, **then** no row is unaccounted for and every `DROPPED` row has been seen by the owner.
- **AC-39** `[all]` **Given** copy recorded verbatim in the register — error sentences, refutations, empty states, the GST refutation paragraph, the split-coverage sentences, the worked-example step trace including the steps that did nothing — **when** the corresponding ops2 surface renders, **then** that copy is present as recorded, or the row is `DROPPED` under AC-37.
- **AC-40** `[all]` **Given** the set of API endpoints the legacy console calls, **when** ops2 is complete, **then** each is either called by ops2 or recorded as deliberately unsurfaced with a reason. Machine-checkable, and a cheap cross-check on the register.

### 9.9 Derivation (D8, D9) `[R3]`

- **AC-41** **Given** a line the estimator produced, **when** staff open its derivation without leaving the record, **then** it presents: the origin file, the extracted text, the requirement derived, the reasoning, and the candidates considered.
- **AC-42** **Given** the candidates for a line, **when** they are shown, **then** each carries its rank and its human-readable reason as recorded in `candidate_result`, and the losing candidates are reachable in one action from the line.
- **AC-43** **Given** evidence rows whose `page_no`, `sheet_ref` and `region_json` are NULL — which is all of them in production — **when** the derivation renders, **then** the absence is stated in words on screen, and the section is neither blank nor omitted.
- **AC-44** **Given** the derivation surface, **when** it renders, **then** every value shown is present in the data; no candidate, reason, score or page reference is invented or inferred for display.
- **AC-45** **Given** a customer on the phone asking "why that one, and why not the cheaper one?", **when** the reviewer answers, **then** both answers are readable from the record without opening a file, a PDF, or another destination.

### 9.10 Work — the attention surface (D12, D10) `[R4]`

- **AC-46** **Given** catalogue products missing pricing information, **when** the landing page opens, **then** those products are named on it, with a route to the screen that fixes them.
- **AC-47** **Given** delivery zones configured with NULL rates — the `unpriced_table` state — **when** the landing page opens, **then** those zones are surfaced as needing attention, distinctly from a zone that is priced at zero and from a project with no zone. `ASSUMED:` inclusion of unpriced zones in the attention set; see Decision 4.
- **AC-48** **Given** nothing at all needing attention, **when** the landing page opens, **then** it says so in a sentence rather than rendering empty regions.
- **AC-49** **Given** the landing page, **when** it renders, **then** it carries no lifetime-revenue or total-money-earned metric (D12).
- **AC-50** **Given** a record, **when** staff mark it as with the manufacturer, **then** the record shows that state, its queue row shows it, and the landing page surfaces it.
- **AC-51** **Given** a record marked with the manufacturer, **when** staff clear the mark, **then** it clears everywhere it was shown, with no further consequence.
- **AC-52** **Given** the "with manufacturer" state, **when** it is set or cleared, **then** no message, email or notification is sent to anyone, and no messaging surface exists anywhere in ops2 (D10).

### 9.11 Installability (D14) `[R8]`

- **AC-53** **Given** ops2 on each reference device, **when** the add-to-home-screen flow is used, **then** it installs and launches into the console, passing Cloudflare Access as it does in the browser.
- **AC-54** **Given** an installed instance and a newer version deployed, **when** it is launched, **then** it runs the newer version.
- **AC-55** **Given** an installed instance with no connectivity, **when** it is launched, **then** it fails loudly per I6 and does not present cached data as current.
- **AC-56** **Given** ops2 installed, **when** its capabilities are enumerated, **then** it requests no push permission and registers no push subscription (deferred, §6.2).

---

## 10. Abuse cases — the forbidden actions, and the attempts that prove they fail

**Why this section exists.** ops2 reaches financial PII (payout bank details, ABNs), customer pricing, and every project in the business, behind an authentication boundary this project must not weaken. `CLAUDE.md` requires negative criteria for such a surface, specified up front rather than discovered at review.

**Binding on the tester: a criterion in this section verified by code inspection alone is NOT verified.** The forbidden action must be attempted against a running system and the denial recorded — status, body, and the absence of any state change.

**Two general rules for every criterion below.** A refusal changes nothing. And where the requester is not a founder — a partner, or a role without reach — a refusal must not disclose whether the thing exists: "not yours" and "no such thing" answer identically, the discipline `worker/routes/auth.ts:35` already applies on the customer side.

### 10.1 The Access boundary (C8 — must be unchanged, and must stay closed)

- **AC-57** `[R2]` **Given** Cloudflare Access is configured (team domain and audience both set), **when** a request reaches the Worker with **no** `Cf-Access-Jwt-Assertion` header, **then** it is refused, and no internal-session fallback authenticates it. *(This fail-closed property exists today; the criterion is that ops2 does not regress it.)*
- **AC-58** `[R2]` **Given** a validly signed Access assertion issued for a **different Access application** (a different `aud`), **when** it is presented to ops2, **then** it is refused.
- **AC-59** `[R2]` **Given** an assertion that is expired, not-yet-valid, signed by an unknown key, signed with `alg: none`, or bearing a different issuer, **when** each is presented, **then** each is refused, and none authenticates.
- **AC-60** `[R2]` **Given** a real customer's `apertly_session` cookie for a `type='customer'` account, **when** it is presented to any `/api/ops/*` endpoint under production configuration, **then** it is refused and no ops data is returned.
- **AC-61** `[R2]` **Given** a person removed from the Cloudflare Access policy whose ops2 role row still exists, **when** they attempt to reach ops2, **then** they are refused at the perimeter. **And given** a person still on the Access policy whose role has been revoked in ops2, **when** they reach ops2, **then** every capability is refused. **Either revocation alone is sufficient** (I7).
- **AC-62** `[R2, R8]` **Given** the ops2 deploy, **when** the Access configuration is compared before and after, **then** the policy, the audience, the team domain and the MFA requirement are byte-for-byte unchanged.

### 10.2 Permission — privilege and elevation

- **AC-63** `[R2]` **Given** a signed-in non-admin staff member, **when** they call the role-assignment endpoint directly for themselves or for anyone else, **then** 403, and no `role` value changes in the database.
- **AC-64** `[R2]` **Given** any staff member, **when** they submit a `role`, `permissions` or equivalent field inside a request body for an endpoint that is not the role-assignment endpoint — their own profile, a record update, a settings save — **then** the field is ignored or rejected, and their role is unchanged.
- **AC-65** `[R2]` **Given** a role that permits quote review and nothing administrative, **when** they request, one at a time, each pricing, rate-card, option-pricing, catalogue, policy, staff-administration and referral-payout endpoint by direct URL — bypassing the console's navigation entirely — **then** each returns 403 and no data from the refused surface appears in any response body.
- **AC-66** `[R2]` **Given** a manufacturer-role identity, **when** they request every ops2 endpoint other than the ones their role permits, **then** each returns 403 and no project, quote, price, customer, payout or catalogue data is returned. *(The phase-2 surface is not built; the boundary is enforced now — §3.3, §6.2.)*
- **AC-67** `[R2]` **Given** a manufacturer-role identity, **when** they open ops2, **then** the console offers only what their role permits — **and** the refusal in AC-66 holds regardless, because hiding a destination is not a control.
- **AC-68** `[R2]` **Given** a deep link (D11) to a record a role may not read, **when** it is opened by that role, **then** it is refused, and the refusal does not disclose whether the record exists.
- **AC-69** `[R2]` **Given** any endpoint added anywhere in ops2, **when** it is reached by an identity with no role, **then** it refuses — endpoints are staff-gated by default and open only by explicit opt-in, never open unless someone remembered a gate.

### 10.3 Financial PII (payout details, ABNs)

- **AC-70** `[R7]` **Given** a role without payout permission, **when** they request the referral payouts screen or any of its endpoints, **then** 403, and no BSB, account number or account name appears in any response body.
- **AC-71** `[R7]` **Given** the referrals list screen, **when** its response body is inspected in full, **then** it contains no BSB and no account number for anyone (referral spec AC-102).
- **AC-72** `[R7]` **Given** a permitted role reading payout details on the payouts screen, **when** the read occurs, **then** a `payout_details_access` row is written with `actor_user_id ≠ subject_user_id`, and the row records the fact of access and never the value (referral spec AC-104, AC-82).
- **AC-73** `[R7]` **Given** any ops2 request that touches payout details, **when** Worker logs and any telemetry for that request are inspected, **then** no BSB and no account number appears in them.
- **AC-74** `[R7]` **Given** the `payout_details_access` log, **when** every ops2 route, screen, report, export and filter is enumerated, **then** none reads it — it has a write path and no reader anywhere (referral spec AC-82).
- **AC-75** `[all]` **Given** any ops2 surface other than the payouts screen, **when** its response bodies are inspected, **then** no full bank account number is returned.

### 10.4 Data-scoping and injection

- **AC-76** `[all]` **Given** any ops2 list or record endpoint that accepts an identifier, **when** an identifier is supplied for an entity of a different type, a malformed identifier, or one belonging to a record the role may not reach, **then** the request is refused and no data is returned.
- **AC-77** `[R6]` **Given** a role permitted to review quotes but not to price, **when** they attempt a rate-card write by replaying a captured admin request with their own identity, **then** 403 and the rate card is unchanged, at the same version.
- **AC-78** `[all]` **Given** any free-text field in ops2 — a note, a void reason, a bank reference, a rule label — **when** text containing script or markup is stored and later rendered, **then** it renders as text and does not execute.

---

## 11. Edge cases

Recurring trouble spots in this domain, each of which must be answered by design rather than discovered in production.

**GST inc/ex.** The house rule binds customer surfaces; ops is not a customer surface — but the reviewer is reading numbers aloud to a customer who is looking at their own quote in their own mode. So: **ops2 shows the project owner's GST mode as the primary figure, always labelled with the mode**, and any view toggle the reviewer uses is a view only. `ASSUMED:` this reading of the house rule for ops.
- **AC-79** `[R1]` **Given** a project whose account is in `ex` mode, **when** its record is opened, **then** the primary money figures are ex-GST and labelled as such; and **given** an account in `inc` mode, they are GST-inclusive and labelled.
- **AC-80** `[R1]` **Given** a reviewer switches the ops view between inc and ex, **when** they do, **then** the customer's stored `price_gst_mode` is unchanged and no customer surface moves.

**Quote lifecycle.** Only the editable states render an editor, so a save can never silently 404 (today's `EDITABLE` set). An issued quote is read-only, and the read-only bar must name the real cause rather than a stale label.
- **AC-81** `[R1]` **Given** a quote in a state outside the editable set, **when** its record opens, **then** no line editor renders and the surface names the actual cause and what returns it to editable.

**Offerability.** The gate has **two separate completeness bars — configuration completeness and pricing completeness — that must never be merged into one flag**, and `[]` (authored as none) is a different fact from `NULL` (not yet authored). Glazing is optional.
- **AC-82** `[R6]` **Given** a product incomplete on configuration and a product incomplete on pricing, **when** the products surface reports coverage, **then** the two are reported as distinct facts and never collapsed into one "incomplete" flag.
- **AC-83** `[R6]` **Given** an option list stored as `[]` and one stored as `NULL`, **when** each renders, **then** "none apply" and "not yet authored" are shown as different states.
- **AC-84** `[R1]` **Given** a line configured with a product that has since become non-offerable or withdrawn, **when** the record opens, **then** the line still opens, still prices, and the product's state is named on it — the line does not vanish and the editor does not refuse to load.

**Delivery zones.** A zone with NULL rates is *unpriced* — configured but not yet given numbers — and that is a distinct state from missing. All fifteen production zones are currently in it.
- **AC-85** `[R1, R4]` **Given** a project whose zone resolved as `unpriced_table`, **when** its delivery figure renders, **then** it reads as unpriced, distinctly from `$0` and distinctly from an unresolved zone, and the zone basis (`postcode_zone` / `fallback_zone` / `unpriced_table`) is stated.

**Composites.** The coverage sentences are never a veto (units may span more or less than the opening — "Allowed — recorded on the line"), and incompatible frames stay selectable and marked. Both are I1 in miniature and must survive.
- **AC-86** `[R1]` **Given** units that span more or less than the opening, **when** staff save, **then** the save succeeds and the divergence is recorded on the line rather than blocked.

**Dates and identity.** One date format across the whole console (two exist today). The public reference is the anchor and is never renamed; the order number renders alongside where an order exists; an anonymous submitter's submit-time contact details still render.

**The manufacturer boundary at phase 1.** A manufacturer-role identity has no landing page to land on. The console must not crash, must not present an empty shell, and must give them a way to see who they are signed in as and to sign out.
- **AC-87** `[R2]` **Given** a manufacturer-role identity, **when** they sign in to ops2, **then** they reach a coherent screen, can see their identity, and can sign out.

---

## 12. Rollout, the fire escape, and deletion `[R8]`

D2 is the owner's decision and is not reopened: *"once new version of ops is ready — we will start using it and delete the old one."* No parallel running as a way of working. That is not the same as no fire escape during the changeover, and §7 of the conclusions sets out the mechanism, which this spec adopts unchanged.

- **Switch-over and deletion are two events**, different commits, different deploys, separated by a soak. Between them the old console is in the bundle but not routed by default: reachable by the two founders at an unadvertised path, used only if ops2 fails at something. Nobody works in it.
- **Rollback is a deploy, not a rebuild.** `wrangler versions upload` for a preview that does not move production traffic, then `wrangler versions deploy` to promote — the procedure `CLAUDE.md` already mandates for sensitive surfaces.
- **The one real hazard is RBAC, and C8 narrows it.** Authentication does not change, so no rollback can leave anyone unable to *sign in*. What changes is role **assignment**. So the migration must be **additive**: the existing domain-based role path keeps working, untouched, for as long as the old console exists. Both resolution paths run simultaneously through the soak. Removing the domain path is part of **deletion**, not switch-over. This is why AC-34 tests a **write**, not a sign-in.
- **Deletion** removes the old console, its Vite entry, and the domain-based identity path in one commit — trivially revertible from git.

- **AC-88** **Given** switch-over is deployed, **when** a founder opens the unadvertised legacy path, **then** the old console loads and works.
- **AC-89** **Given** the soak, **when** deletion is proposed, **then** the register's gate (AC-38) has passed and the owner has judged ops2 ready. No fixed soak period is imposed (O2, closed).
- **AC-90** **Given** deletion is deployed, **when** the domain-based role path is removed, **then** every ops2 identity resolves by granted role alone and no capability is lost.

---

## 13. The referral program's ops surface

The referral program's ops screens are being built **into the legacy console right now, as disposable work** (D17):

> "yes, it will build some screens into legacy, it's about to start doing that."

**ops2 carries the referral program's *requirements*, not its screens.** The legacy screens are not ported, re-skinned or copied; the requirements are re-satisfied in ops2's own structure and re-tested there.

**The requirement set**, from `docs/specs/referral-program.md` §8.4 and §8.5 and `docs/design/referral-program-ux.md` §8:

| Requirement | Source |
|---|---|
| **Program configuration** — every number, the On/Off switch, the two side switches, a live restatement of what the settings mean, a stale-save refusal with its own copy, and the switch-off confirmation stating that nothing already promised is withdrawn. | spec §8.4a, ux §8.1 |
| **Referrals list** — filter, search, per-row void with a mandatory reason and un-void, the referred order linked to its record, review-flag detail on the row. **No banking on this screen.** | spec §8.4b, ux §8.2 |
| **Payouts** — grouped per referrer, one transfer each, deadline-flagged against the promised timeframe, per-row record-payment with a bank reference, per-row reversal with a required reason, payments-made history with frozen bank details, CSV export for the accountant. **The one screen where an actor sees another person's banking.** | spec §8.4c, ux §8.3 |
| **The referral link action at account creation** — takes a **code and nothing else**, calls the same `recordReferral` gates, shows each refusal with its specific reason (internal surface), records `source: 'manual'`. **No path by which a referrer supplies a mate's details.** | spec §8.4d, AC-78 there |
| **Attention-surface row** — referral payouts ready, only when there is money waiting, with its age when over promise. | ux §8.4 → this spec's D12 surface, AC-46/48 |
| **On the record** — the referral discount and its review flags (shared ABN / phone / business name) visible **before** a reviewer issues. Ops-only, never serialised to a customer response. | spec AC-58, ux §8.5 |

**Its abuse criteria are AC-70 to AC-75 above**, which restate the referral spec's AC-102, AC-103, AC-104 and AC-82 against ops2's permission model.

**The requirement set is in flight, and this is how that is handled:**

- **AC-91** `[R7]` **Given** R7 begins, **when** its design starts, **then** the referral requirement set is pinned to a named commit of `docs/specs/referral-program.md` and `docs/design/referral-program-ux.md`, recorded in the carry-across register.
- **AC-92** `[R7, R8]` **Given** the pinned set and the then-current documents at switch-over, **when** they are compared, **then** every difference is either satisfied in ops2 or recorded as a `DROPPED` row under AC-37.
- **AC-93** `[R7]` **Given** ops2's referral surface, **when** the referral spec's ops criteria (AC-38 to AC-47, AC-58) are executed against it, **then** each passes against ops2 — not against the legacy screens.
- **AC-94** `[R8]` **Given** the legacy console is deleted, **when** the weekly payout run is performed, **then** it is performed entirely in ops2, with no recourse to the fire escape.

---

## 14. Domain vocabulary the architect must add to `CONTEXT.md`

`CONTEXT.md` is the architect's to maintain. These terms are load-bearing in this spec and it lacks all of them.

| Term | What it must capture |
|---|---|
| **Record** | The merged plane of a project and its order, addressed as one thing in ops. `Project` remains the container; `Record` is what ops opens. Needed because ops2 stops treating orders as a separate destination. |
| **Derivation** | The chain from an uploaded schedule to a proposed line: origin, extracted text, requirement derived, candidates considered, selection. Words and data, never drawings (D8). |
| **Candidate** | One evaluated product × variant for an opening, carrying per-filter pass/fail, a human-readable reason, six score components and a rank. Recorded in `candidate_result`. **A losing candidate is a first-class thing ops shows, not an internal artefact** (D9). |
| **Divergence record** | The single fact recorded on a quote **at issue** naming where the human decided differently from the estimator's proposal. One per issue, never per save or per line, never customer-facing (C5, D19). |
| **With manufacturer** | A state on the work meaning it is waiting on the manufacturer. **Orthogonal to `Phase`** — it is not a phase, and `Phase` remains the one linear customer-facing path. |
| **Attention surface** | The console's landing page: what needs doing or is critically wrong. Explicitly not a metrics dashboard (D12). |
| **Role** | A per-user grant deciding what a signed-in person may do. **Distinct from Cloudflare Access**, which decides who they are. Both are required; either revocation locks someone out (C8). |
| **Manufacturer partner** | A person admitted through the same Access policy who is **not staff**: refused everything except their own surface, enforced per endpoint rather than by hiding a destination. |
| **Staff** *(sharpen)* | Today's entry describes staff-ness as an axis on an account. It should also record that staff-ness no longer implies uniform capability once RBAC ships. |

---

## 15. Assumptions

Every `ASSUMED:` in this document, collected so none is buried. Each is vetoable at review.

| Tag | Assumption | Where |
|---|---|---|
| A-1 | A quote issued with no divergences writes an explicit empty divergence record, so "agreed with the machine" is distinguishable from "never issued". | AC-8 |
| A-2 | Re-issuing a quote writes a new divergence record and retains the prior one, rather than overwriting. | AC-9 |
| A-3 | The conversation-pace budget is p95 ≤ 1200 ms from input to both totals updated, on the reference devices over a mobile connection. The requirement that both totals move together is not assumed. | AC-16 |
| A-4 | Unpriced delivery zones belong in the attention surface's set. | AC-47, Decision 4 |
| A-5 | Ops shows the project owner's GST mode as primary, labelled, with any reviewer toggle being a view only that never writes the customer's preference. | AC-79, AC-80 |
| A-6 | The tracking issue on `siaribuild/apertly` carries build regions as sub-issues and is **not** labelled `wayfinder:map`, because the frontier is empty. | §7 |

---

## 16. Decisions needed

Five. Everything else in this document is decided — by the grill, by the code, or by me.

### Decision 1 — What may a Reviewer do, and what role set ships?

§3.2 names one need: *"someone to review quotes but not to have admin accesses."* Today four role values exist (`estimator`, `technical_reviewer`, `manager`, `admin`) but **only `admin` gates anything at all** — the role-assignment endpoint and the customer sign-in-email edit. The other three are labels. ops2 has to make roles mean something, and the question is how many and how sharp.

Note the tension that makes this a real question: §4 says consultation *"can involve changing any parameters, any options, including pricing"* — so a Reviewer who cannot change a line's price cannot do the job they were hired for. "Not admin" therefore has to mean something other than "cannot touch money on a quote".

**Recommended:** ship **three roles**, and retire the three label roles.
- **Admin** — everything, including roles, rate cards, option pricing, policy, and referral payouts.
- **Reviewer** — records, lines, options, per-line price overrides, issue a quote, notes, enquiries, customers. **Not** rate cards, option pricing, catalogue configuration, program settings, referral payouts, or roles.
- **Manufacturer partner** — nothing in phase 1 beyond their identity and sign-out; their surface is phase 2. Enforced now (AC-66).

More roles later is additive and cheap; starting with a capability matrix for two people is not.

### Decision 2 — Where does "with manufacturer" sit in the triage order?

The queue sorts **Us → Customer → Nobody**, then by longest waiting, and that sort is deliberate and not user-overridable. D10 adds a "with manufacturer" state. It has to sort somewhere, and this is the order the two of you triage by every day.

**Recommended:** **Us → Manufacturer → Customer → Nobody.** The reasoning is your own lost-day argument: the manufacturer call is the one that has to happen *today* or the day is gone, and a manufacturer who has gone quiet is chaseable in a way a customer often is not. If you would rather chase customers first, say so — it is one line either way, and I would rather have it right than defensible.

### Decision 3 — What defines a divergence, for the record written at issue?

C5 records "the divergences between what the system proposed and what the human decided" as one fact per quote. Which changes count is a business definition, not something derivable from the code.

**Recommended:** any field on a line where an estimator proposal exists and the issued value differs — **product, configuration/variant, dimensions, options, and price override** — recorded as proposed → issued pairs, per line, in one record. Excluded: room labels, notes, and anything the estimator never proposed (nothing to diverge from). If you want price overrides recorded separately from configuration changes, that is a cheap split and worth saying now.

### Decision 4 — What belongs on the attention surface?

D12: *"should surface actions needed to be performed by us, or information of critical importance, such as products in the catalogue missing pricing information […] Not fussed about anything non-critical such as the amount of money we made in total."* You gave one example; the full set is the landing page's entire content, and it is yours to fix.

**Recommended set**, each rendering only when non-empty:
1. The five "needs us" groups that exist today (new submissions, unpriced projects, enquiries, and so on) — carried across.
2. **Products missing pricing information** — your stated example.
3. **Delivery zones configured but unpriced** — all fifteen are, in production right now, and a project cannot be honestly issued without a delivery number.
4. **Work with the manufacturer** (D10), with how long it has been there.
5. **Referral payouts ready**, with an age flag when past the promised timeframe (§13).
6. **Products with no rate card**, which the server already computes and nothing renders.

Anything you would add, or cut? Item 3 in particular is my inference from a known production gap, not something you said.

### Decision 5 — Do you accept the decomposition, and R1 first?

§7 argues that this ask cannot be one spec and should not be charted as a wayfinder map (the frontier is empty — charting decisions you have already made would cost your time and yield nothing). Instead: this document is the spine, and the build runs as **eight regions**, each through the normal pipeline, in this order:

**R1** frame + record → **R2** identity and permission → **R3** derivation → **R4** work → **R5** people and archive → **R6** catalogue and commerce → **R7** referrals → **R8** installable, switched over, deleted.

R1 first is D7 (*"Workplace first"*). R2 second is my call: every region after it is then built against the final permission gate, and the abuse battery in §10 is executed once rather than after every new screen.

**Recommended:** accept. If you would rather see the front door (R4) earlier — it is the screen you look at most — say so; the cost is that the queue is built before the records it points at, and rework is likely.
