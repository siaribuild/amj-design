# ops2 — the staff operations console, rebuilt

Branch: `design/ops2-planning`
Status: **revision 3 — governing spec. Decisions needed: none (§16 is empty).**
Author: product-manager (pipeline stage 1)
Date: 2026-08-17

**Revision 2 — dormant capabilities.** External review found that revision 1 silently dropped the legacy console's manufacturer-only Enquiries view. It was right that the silence is a defect, and right that the deferral itself is not — the owner deferred the partner surface (GRILL-CONCLUSIONS §6, §3.3) and it is unagreed with AMJ. More importantly it named a **class the register was blind to**: capability that exists in legacy code but has never been reachable in production, because §B.4 described what the console *does*, not what it *would do if configured*. Revision 2 adds a sixth register state (`DORMANT`), an **environment** column on every register row, the three dormant capabilities a sweep found (§8.1), and two abuse criteria that stop a dormant control becoming a live hole (AC-57a, AC-66a). **No scope changed.**

**Revision 3 — the owner answered all five decisions.** Roles settled as recommended (§9.7). Triage sort settled, and it turns out to be a **type and derivation change, not a sort change** (§9.10). **Divergence is wider than I proposed and its baseline moved**: the comparison is against *the original information* — including extracted opening dimensions — not merely the estimator's recommendation, and there is no field allow-list (§9.2). **The attention surface is cut to two items**, with four moved to phase 2 rather than deleted (§9.10, §6.2). Decomposition accepted unchanged. §16 is now empty.

## Inputs, and their standing

| Input | Standing here |
|---|---|
| `docs/ops-redesign/GRILL-CONCLUSIONS.md` | **Binding.** Pipeline stage 0, seven rounds with the owner. D1–D19, C1–C8, §1 actors, §6 deferrals, §9 verified facts, §10 rejections. Where anything else disagrees, this wins. §1 is carried into §3 below **verbatim**. |
| **The owner's answers at the revision-3 decision gate** | **Binding**, and quoted verbatim where he gave words. Folded into §9.2, §9.7, §9.10 and §6.2. |
| `docs/ops-redesign/UX-SPEC.md` **§B.4, left column only** | **Factual.** 291 rows describing the console that exists **today**. The basis of the completeness contract (§8) — with the blind spot §8.1 corrects. |
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

*(The role that serves this need is settled in §9.7: **Reviewer**.)*

### 3.3 Manufacturer partner (AMJ) — phase 2, boundary designed now

The showrooms are the manufacturer's. Requests for physical inspection are currently forwarded to them by email:

> "the showroom are owned by manufacturer, and requests for physical inspection need to be passed through to them. We are forwarding email notifications on requests, but we though it would be so much more easier for them to login and update status on what has happened. […] it also just access/visibility feature — they need to be able to see a single working area, not the rest."

**Need (phase 2):** to see the appointment/inspection requests that concern them, and to record what happened — nothing else. A later ambition, explicitly raised when deep links were discussed, is direct price maintenance:

> "if we could get manufacturer on board to use the platform to update pricing directly […] no more sending out emails/pdfs, no more manual reconciliation!"

**Not a customer of the platform. No multi-tenancy.** Access is internal, by identity, for people the founders choose to admit.

> **What serves this actor today, and is unaffected by ops2:** appointment enquiries are emailed to the manufacturer (`MANUFACTURER_TO` is configured in production), and staff record the handoff on the enquiry — `Handed off`, `Acknowledged`, `Mark acknowledged`, and two reference fields. **That staff-side handoff is live, in use, and a full carry-across obligation** (§B.4 row 189, region R5). It is a different thing from the partner logging in, which is §8.1's dormant entry D-1 and is deferred.

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
| **I8** | **Nothing that works today disappears silently — and nothing dormant is let go silently either.** The carry-across register (§8) is the instrument, and it is a hard gate on switch-over and on deletion. | C7, D18 |

**I4 has a consequence the rest of the spec does not soften.** D3 is categorical — *"everything works on the phone"* — so a surface that renders "this needs a wider screen" fails it. The exploratory UX-SPEC proposed exactly that for the rate-card editor (its row 269). **That proposal is void.** The rate-card editor is the hardest width problem in the console and it is in scope at the narrowest target. This is stated here rather than negotiated later.

---

## 6. Scope

### 6.1 In scope

1. **All eight of today's surfaces**, rebuilt: dashboard, projects, customers, enquiries, pricing, files, audit, admin — reorganised as the design stage decides, with every capability in the carry-across register accounted for.
2. **The record** — project and order as one plane: identity, phase, actions, lines, the line editor, composites/split/merge, notes, files, history, payments.
3. **The derivation surface** (D8) — origin, reasoning, extracted text, the requirement derived, the candidates considered. **Including the endpoints that must be added to serve it** — see §6.4.
4. **Losing candidates, ranked, with reasons, one tap away** (D9).
5. **RBAC, per user** (D5), with the three roles settled in §9.7 — replacing domain-based **role assignment**, with the domain path kept alive additively through soak (§12).
6. **The "with manufacturer" state** on the work, visible in the queue (D10). Not a messaging system. *(Its landing-page surfacing is phase 2 — §6.2, Decision 4.)*
7. **Deep links to every record and every line** (D11).
8. **The landing page as an attention surface** (D12), carrying **two item classes in phase 1** — work requiring attention, and product catalogue gaps (§9.10).
9. **Record-scoped Audit and Files, with the global lists retained** (D13).
10. **Installability — add-to-home-screen** (D14). Not an App Store / Play Store app.
11. **The referral program's ops requirements**, carried across from the legacy build (D17, §13).
12. **Switch-over, the soak fire escape, and deletion** as three separate events (D2, C7, §12).
13. **The carry-across register** (§8), including its dormant-capability entries (§8.1), created, discharged and closed.

### 6.2 Out of scope — deferred to phase 2 or later

Directly from GRILL-CONCLUSIONS.md §6:

- **Manufacturer login and their single working area** (appointment/inspection status). **The boundary is designed and enforced now; the surface is phase 2.**

  > **Stated plainly, because the legacy console already ships a partial version of it.** `src/ops/OpsApp.tsx:85-86` gives a `manufacturer`-role user exactly one tab — Enquiries — and lines 194–195 land them on it as their only destination. **It has never been reachable in production:** `MANUFACTURER_EMAIL_DOMAINS` is unset in `wrangler.jsonc`, `isManufacturerEmail` (`worker/lib/staff.ts:39`) matches on email domain alone, and production holds exactly three internal users, all `admin` — **no manufacturer account has ever existed.** So this is code that has never had a user, not a capability in use.
  >
  > **ops2 declines to carry it forward**, pending the phase-2 partner work, which is unagreed with AMJ. It is register entry **D-1** (§8.1) and the owner sees it there rather than discovering its absence. **What is not deferred is the refusal:** the manufacturer role must be refused at every ops2 endpoint from day one (AC-66, AC-66a), so a dormant role cannot become a live hole the moment someone sets an environment variable.

- Manufacturer direct price maintenance.
- Live presence — "X is looking at this now" (D16).
- Push notifications — deliberately deferred until the console has been used for a fortnight, so *"what is worth interrupting me for"* is decided from experience. Installability (D14) is what makes iOS push possible later.
- Extractor work to emit page number, sheet reference and region geometry. Its own feature with its own justification, **never a dependency of this redesign**.
- Offline editing with conflict resolution — explicitly not wanted (D15).

**Added at the revision-3 gate — four attention-surface items the owner moved to phase 2.** Owner: *"key information at this point is: orders requiring attention, product catalogue gaps. Everything else can be phase 2."* Recorded rather than deleted, because each is a real gap that will want raising again:

- **Delivery zones configured but unpriced.** All fifteen production zones are in this state right now, and a project cannot be honestly issued without a delivery number. This was **my inference, not his ask** — correctly flagged as mine at the gate, and not taken. It remains true and remains worth raising later.
- **Referral payouts ready, with an age flag past the promised timeframe.** See §13 — the payouts *screen* is fully in scope; only its landing-page prompt is deferred, and that becomes a register row the owner sees at R7.
- **Work with the manufacturer, with how long it has been there.** The state itself is in scope and visible in the queue (D10); only its landing-page surfacing is deferred.
- **Products with no rate card**, which the server already computes and nothing renders.

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
- **The debug thermal endpoint** (`/api/debug/thermal`, disabled whenever `THERMAL_DEBUG_KEY` is unset — which it is). Not a console surface and not surfaced by ops2. Recorded so it is not rediscovered as a gap.
- **Estimator engine selection** (`PARSE_ENGINE`, `AI_STAGE_CACHE`, `AI_ESCALATION_MODE`, `SCAN_ENGINE` and their companions). ops2 renders what these produce; it does not expose or change them.

### 6.4 Scope the conclusions create that the exploratory documents did not

**This is the single largest consequence of the conclusions overriding the mock, and it must not be lost.**

The exploratory UX-SPEC resolved `candidate_result` by *stating its absence on screen* — "the candidate evaluation is recorded but no endpoint reads it" (its rows 283–284). **D9 is binding and says otherwise:**

> "the customer, home owners in particular, might want to save money and choose the next-worse solution that is cheaper despite marginally failing to meet requirements."

Losing candidates are **shown, one tap away, ranked, with reasons**. The data is there — 3,989 rows in production, carrying exactly rank, reason and per-filter pass/fail. **The conclusions win, so ops2 adds the read endpoint.** Likewise `GET /projects/:id/building-model`, which exists and has zero callers, is called by ops2.

**Revision 3 widens this further.** Because the divergence baseline is now *the original information* including extracted opening dimensions (§9.2), the original extracted values must be **resolvable per line field at issue time**. That is a second, independent reason the evidence and building-model read paths are in scope, and it is R3's largest single design problem.

What genuinely stays *unwired and stated* is only what has no data behind it, verified against production: `evidence_items.page_no`, `sheet_ref` and `region_json` are **NULL on all 1,000 rows** because the extractor never produces them (the write path binds real values; the producer does not). D8 covers this exactly: **the absent visual is stated, not blank.**

---

## 7. Sizing judgement — decompose, but do not wayfind

**Accepted by the owner at the revision-3 gate, unchanged.** The argument is retained because the regions inherit from it.

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
| **R2** | **Identity and permission** | RBAC per user, three roles (§9.7); role assignment moved off email domain; per-endpoint authorization; the staff administration screen; the additive migration; the rollback drill. | Second, so **every region after it is built against the final gate** and the abuse battery in §10 is executed once against a stable surface rather than re-run after each new screen. R1 ships against the existing role resolution, which stays live regardless (§12). |
| **R3** | **Derivation** | The derivation surface (D8); losing candidates ranked with reasons (D9); the `candidate_result` and `building-model` read paths (§6.4); thermal audit; learning/teach; evidence; **the divergence record at issue and its original-value resolution** (I2, §9.2). | The record's other half, and the highest-value unmet need in §3.1 — *"it should be on the screen, ready for consumption."* Depends on R1's record. **Revision 3 made this the heaviest region** — see §9.2. |
| **R4** | **Work** | The landing page as an attention surface, two item classes (D12, §9.10); the merged queue and its saved views; the "with manufacturer" state and the four-value triage sort (D10). | The front door needs records to point at, so it follows them. |
| **R5** | **People and archive** | Customers, enquiries/leads **including the live manufacturer handoff panel** (§3.3), the global Files list, the global Events list, record-scoped Files and Audit (D13). | Independent of R1–R4 once the frame exists; sequenced here because R6 is harder. |
| **R6** | **Catalogue and commerce** | Products, rate cards, options, the worked-example trace, reconciliation, Settings (Commercial, Policy, Catalogue, Staff-facing policy). | **The hardest width problem in the console** (I4's consequence) — it benefits from the layout system being proven across five prior regions. |
| **R7** | **Referrals** | The referral program's ops requirements, re-satisfied in ops2 (§13). | Sequenced after the legacy referral work settles, so the requirement set is stable when it is carried (D17). |
| **R8** | **Installable, switched over, deleted** | Installability (D14); the switch-over deploy; the soak fire escape; the deletion commit (D2, C7, §12). | Last by definition. |

**R1 does not exit design review until the carry-across register exists and every one of its rows is assigned to a region.** That is what stops region 7 discovering that nobody owned rows 233–272.

---

## 8. The completeness instrument — the carry-across register

D18 gives quality to the owner: *"I will be accepting that and I consider myself competent in UX."* That is his to judge, and this spec does not attempt to score it. **What this spec carries instead is completeness**, and completeness needs an instrument that can fail.

**The register** is a table with one row per capability that exists in the console today. Its rows come from **`UX-SPEC.md` §B.4's left column only** — the 291-row inventory of current behaviour, which is factual — **plus §8.1's dormant entries**, which §B.4 could not see. Its right column (the exploratory proposal of where each lands) is discarded, along with the rest of that document's rules.

Each row carries: the capability, its verbatim copy where copy is part of it, its region, **the environment in which it is exercisable**, its state, and — where let go — the owner's decision.

**Environment:** `PROD` where the capability is exercisable in production, `NON-PROD` where it is only exercisable locally or in staging. This column exists because the deletion gate (AC-89) asks whether a capability has been *exercised on real work*, and for a `NON-PROD` row that question has no production answer — the evidence has to come from the environment the capability actually runs in. Without the column, those rows either block deletion forever or get waved through.

**States:**

| State | Meaning | Evidence required |
|---|---|---|
| `CARRIED` | The capability exists in ops2 and has been exercised. | The tester performed it in ops2, in the row's environment, and recorded the result. |
| `REPAIRED` | The capability exists, and a defect in it was fixed. The capability is still there. | As `CARRIED`, plus the defect demonstrated absent. |
| `RESTATED` | Data or a limit that today is silent or invisible; ops2 states it in words instead of showing it. | The sentence is present on the named screen. |
| `DROPPED` | A **working** capability, deliberately not carried. | **An owner-visible entry naming what is lost and why. Nothing may be `DROPPED` without the owner seeing it.** |
| `DORMANT` | Present in legacy code but **never reachable in production**; not carried into ops2. | **The same owner-visible entry as `DROPPED`** — plus the evidence of dormancy (the unset variable, the absent user, the guard), and the named deferral where one exists. |
| `DEAD` | Unreachable code today — not a capability, and not configurable into one. Removal is not a loss. | Proof of unreachability (no call sites / no route / no reachable branch). |

**Why `DORMANT` is its own state and must not be collapsed back into `DEAD` or `DROPPED`.** `DEAD` asserts *removal is not a loss*, which understates a surface the owner intends to build in phase 2. `DROPPED` implies *a working thing was cut*, which overstates code that has never had a user and would misdirect the owner's attention when he reviews the list. The distinction is the whole point of the class: **dormant code is a decision the owner has already made about the future, not a regression and not rubbish.** Collapsing it loses that.

**Not carry-across obligations, recorded separately so they are not re-discovered as gaps:** §B.4.15 (endpoints that reach no pixel today), §B.4.16 (persisted data with no reader). These are not capabilities today, so losing them is not a regression — but §6.4 promotes two of them into scope deliberately.

**The register is a gate, twice:**

- **Switch-over may not happen while any row is unaccounted for** — every row in one of the six states, and every `DROPPED` and `DORMANT` row seen by the owner.
- **Deletion may not happen while any row is `CARRIED`/`REPAIRED` but not yet exercised** in its recorded environment. Owner's basis for deletion is judgement, not a fixed soak (O2 closed) — but the register says what he is judging.

### 8.1 The register's blind spot — dormant capabilities

**The defect this subsection fixes.** `UX-SPEC.md` §B.4 was compiled by reading the console's behaviour. Behaviour is only visible where it is reachable, so **any capability standing behind an unset environment variable, an absent user, or an environment guard is invisible to it** — and therefore invisible to a register built from it, and therefore silently dropped by a rebuild scoped from that register. That is not a hypothetical: it is exactly how revision 1 lost the manufacturer Enquiries view without a word.

A sweep of the Worker's environment surface (`worker/types.ts`, `wrangler.jsonc`, and the guards that read them) against production data found **three**. Each gets its own register row.

| # | Dormant capability | Evidence it is dormant | State | Environment | Disposition |
|---|---|---|---|---|---|
| **D-1** | **The manufacturer-only Enquiries view.** `tabsFor` (`src/ops/OpsApp.tsx:85-86`) gives a `manufacturer`-role user exactly one tab; `OpsShell` (`:194-195`) lands them on it as their only destination. | `MANUFACTURER_EMAIL_DOMAINS` unset in `wrangler.jsonc`; `isManufacturerEmail` (`worker/lib/staff.ts:39`) matches on email domain alone; production internal users are **three, all `admin`** — no manufacturer has ever existed. | `DORMANT` | `NON-PROD` (constructible locally only) | **Not carried.** Deferred with the phase-2 partner surface (GRILL-CONCLUSIONS §6, §3.3), which is unagreed with AMJ. **The refusal is carried in full and from day one** — AC-66, AC-66a. |
| **D-2** | **The ops OTP sign-in screen** — work-email field, `Send code`, the six-digit field, `Invalid code, or this email isn't authorised for the ops console.`, the dev-code banner, `← Change email`, and the rest of §B.4 rows 5–13. | `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are **both set in production** (`wrangler.jsonc:115`), so `accessIsConfigured` is true and the OTP routes **404 by deliberate design** (`worker/routes/ops.ts:172-189`). In production the screen is never rendered and the routes are not part of the deployment's surface. | `CARRIED` | **`NON-PROD`** | **Carried in full.** It is live and load-bearing in local and staging, which is where every developer signs in. Its rows are exercised there, not in production — which is what the environment column now records. **The production 404 guard is itself carried and tested** (AC-57a): it closed a real hole and a rebuild is exactly where it gets reopened. |
| **D-3** | **External AV scanning of uploads**, behind `SCAN_ENGINE` = `remote`/`both`. | `SCAN_ENGINE` unset ⇒ defaults to `structural`; `SCAN_ENDPOINT` and `SCAN_AUTH` unset. So the on-stack structural scanner runs and the AV path never does. | `CARRIED` | `PROD` (structural), `NON-PROD` (AV path) | **Carried as-is.** ops2 changes no scanning behaviour. The consequence for the console is a rendering one and is criterion AC-85a: the scanner **fails closed** — `unknown` and `scanner_misconfigured` are never clean — so ops2 must render those verdicts distinctly and must never present an unscanned or unknown file as safe. |

**Two things this sweep did not turn up, recorded so the next reviewer does not redo it.** `STAFF_EMAIL_DOMAINS` has a live default (`openframe.com.au`) and is set in production, so nothing behind it is dormant. `MANUFACTURER_TO` **is** set in production, so the manufacturer email handoff and the staff-side handoff panel on an enquiry are live capabilities and ordinary carry-across obligations (§3.3, region R5) — **not** part of D-1's deferral. Conflating those two is the easiest mistake available here.

- **AC-40a** `[R1]` **Given** the register is created, **when** it is reviewed at R1 design review, **then** every row carries an environment value, and §8.1's three entries are present as rows with the states and dispositions recorded above.
- **AC-40b** `[R1]` **Given** the sweep method in §8.1, **when** the register is created, **then** the sweep has been repeated over the then-current `worker/types.ts`, `wrangler.jsonc` and production role data, and any capability it finds that is not D-1, D-2 or D-3 is added as its own row rather than left to scope silence.

---

## 9. Acceptance criteria

Every criterion is Given–When–Then and independently verifiable. `[Rn]` marks the region that owns it; `[all]` means every region is tested against it. The **negative criteria are in §10** and are verified by attempting the forbidden action, not by inspection.

### 9.1 Human authority (I1)

- **AC-1** `[R1, R3]` **Given** a line whose selected configuration diverges from the estimator's proposal or fails a derived requirement, **when** staff save the line, **then** the save succeeds, the chosen values persist, and no confirmation step, justification field, acknowledgement checkbox or second click is required.
- **AC-2** `[all]` **Given** any divergence between an estimator proposal and a human decision, **when** the screen renders, **then** any warning shown does not take keyboard focus, does not appear in an element with `role="dialog"` or `role="alertdialog"`, does not disable the primary action, and does not require dismissal before the work can continue.
- **AC-3** `[R3]` **Given** the losing candidates for a line, ranked with reasons, **when** staff select a candidate the estimator ranked below its own selection — including one that marginally fails a requirement — **then** it is selectable, it saves, and the line prices on it.
- **AC-4** `[all]` **Given** any ops2 surface, **when** the full set of controls is enumerated, **then** no control is disabled, hidden or made conditional on a human agreeing with the estimator.
- **AC-5** `[R3]` **Given** the derivation surface, **when** it renders estimator output, **then** that output is labelled as a proposal, and no copy presents it as a decision, a requirement or an approval.

### 9.2 The divergence record — decided at the revision-3 gate (I2)

**Owner, verbatim:**

> "any line that differs in any way from the original information. It may be proposed product, its parameters, options, or even extracted dimensions of an opening."

**This is wider than revision 1 proposed, in two ways that both matter.**

1. **There is no field allow-list.** Revision 1 enumerated five fields. That is replaced by a rule: **every line field that carries an original value is in the comparison set.** A spec that names five fields is a spec that silently stops recording the sixth.
2. **The baseline is the original information, not the estimator's recommendation.** A dimension read off a schedule *is* original information, so **correcting an extracted opening dimension is a divergence and is recorded** — even though the estimator never "proposed" it in the recommendation sense. The comparison set therefore spans the estimator's product proposal **and** the extracted values (`evidence_items`, the building model), resolved to one original value per line field.

**What is unchanged:** one record per quote, written at issue, never per save and never per line (C5). Internal only (D19).

**The design consequence, stated because it is R3's largest problem.** The original value per field must be *resolvable at issue time*. Today the estimator's proposal and the extracted values live in different places (`draft_order_line` / `proposed_config_json` / `candidate_result` on one side, `evidence_items` and the building model on the other), and nothing resolves them into a single per-field baseline. Establishing that resolution — one place per fact, per the house rule — is R3's design work, not an implementation detail.

- **AC-6** `[R3]` **Given** a quote of three lines, two of which differ from their original information, each edited five times, **when** every edit is saved, **then** **no** divergence record is written by any save.
- **AC-7** `[R3]` **Given** that same quote, **when** it is issued, **then** exactly **one** divergence record is written for the quote, enumerating **every line field whose issued value differs from its original value**, with both values, and no per-line or per-save record exists anywhere.
- **AC-7a** `[R3]` **Given** a line whose opening dimensions were extracted from an uploaded schedule and then corrected by staff, **when** the quote is issued, **then** that correction appears in the divergence record, with the **extracted** value as the original — demonstrating that the baseline is the original information and not only the product recommendation.
- **AC-7b** `[R3]` **Given** a line field for which no original value exists — nothing was extracted, submitted or proposed for it — **when** the quote is issued, **then** it is **not** reported as a divergence. Absence of a baseline is not a difference.
- **AC-7c** `[R3]` **Given** a field is added to a line in some future change, **when** it carries an original value and the issued value differs, **then** it appears in the divergence record without this spec being amended — the rule is "every field with an original value", not a list.
- **AC-8** `[R3]` **Given** a quote with no divergences at all, **when** it is issued, **then** a divergence record is written recording none, and it is distinguishable from a quote that was never issued. `ASSUMED:` an explicit empty record rather than no record — the absence of a record must not be ambiguous between "agreed with the original" and "never issued".
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

### 9.7 Permission — the roles, decided (I7, D5)

**Settled at the revision-3 gate: three roles ship, and the three label roles are retired.** Today four role values exist (`estimator`, `technical_reviewer`, `manager`, `admin`) but only `admin` gates anything at all; production holds three users, all `admin`.

| Role | May | May not |
|---|---|---|
| **Admin** | Everything, including roles, rate cards, option pricing, catalogue configuration, policy and referral payouts. | — |
| **Reviewer** | Records, lines, options, **per-line price overrides**, issue a quote, notes, enquiries, customers. | Rate cards, option pricing, catalogue configuration, program settings, referral payouts, roles. |
| **Manufacturer partner** | Sign in, see their own identity, sign out. **Nothing else in phase 1.** | **Every data endpoint** (AC-66, AC-66a). Their working area is phase 2 (§6.2, register entry D-1). |

**Why Reviewer keeps price overrides.** §4 records that consultation *"can involve changing any parameters, any options, including pricing"*. A Reviewer who cannot change a line's price cannot do the job the role exists for. "Not admin" means **the rate cards and the roles**, not the money on a quote.

*The negative half of this section is §10.2 and is binding on the tester as attempts.*

- **AC-27** `[R2]` **Given** a person admitted to the Cloudflare Access policy with **no role granted**, **when** they open ops2, **then** they are authenticated, every capability is refused, and the console states that they have no role rather than rendering an empty or broken console.
- **AC-28** `[R2]` **Given** a Reviewer, **when** they work, **then** they can open records, edit lines, change options, **set a per-line price override** and issue quotes; and every rate-card, option-pricing, catalogue-configuration, program-settings, referral-payout and role-administration endpoint refuses them.
- **AC-28a** `[R2]` **Given** the three retired label roles (`estimator`, `technical_reviewer`, `manager`), **when** the migration runs, **then** every existing holder is mapped to one of the three shipping roles, no account is left role-less by the migration, and no account gains reach it did not have.
- **AC-29** `[R2]` **Given** an admin changes another person's role, **when** that person makes their next request, **then** the new role applies without them re-authenticating.
- **AC-30** `[R2]` **Given** the only remaining admin, **when** they attempt to remove their own admin role, **then** it is refused and the role is unchanged.
- **AC-31** `[R2]` **Given** a database with no admin at all, **when** a staff member signs in, **then** exactly one is promoted to admin — the existing lockout self-heal — and **given** any admin exists, **then** no promotion occurs.
- **AC-32** `[R2]` **Given** the manufacturer role, **when** it is assigned, **then** it is assigned **per user in ops2**, not derived from the email address, and a partner on an `@openframe.com.au` address is distinguishable from a founder. *(This is what makes D-1's dormancy end: the role becomes assignable. Its surface stays deferred; its refusals stay total — AC-66a.)*
- **AC-33** `[R2]` **Given** the RBAC migration applied to a copy of production data, **when** it is applied, **then** no row in any table is deleted, no `ON DELETE CASCADE` fires, and row counts for `order_line`, `payment`, `quote_line`, `referral*` and `user` are unchanged before and after. *(The `d1-migration-safety` skill is loaded before the migration is written; a clean local run proves nothing.)*
- **AC-34** `[R2]` **Given** the RBAC migration applied and the previous Worker version redeployed, **when** a founder opens the old console, **then** they authenticate, open a record, **and write to it** — authorization is verified, not just sign-in. *(The §12 rollback drill.)*

### 9.8 Completeness (I8)

- **AC-35** `[R1]` **Given** the carry-across register, **when** R1's design review concludes, **then** the register exists with one row per capability in `UX-SPEC.md` §B.4's left column plus §8.1's dormant entries, and every row is assigned to a region.
- **AC-36** `[all]` **Given** a region's implementation is complete, **when** the tester walks the register rows assigned to it, **then** every row is in one of the six states with the evidence that state requires, exercised in the environment the row records, and no row is left unassigned or unevidenced.
- **AC-37** `[all]` **Given** a row moving to `DROPPED` or `DORMANT`, **when** it is proposed, **then** an owner-visible entry names what is let go and why, and the row is not closed until the owner has seen it.
- **AC-38** `[R8]` **Given** the register, **when** switch-over is proposed, **then** no row is unaccounted for and every `DROPPED` and `DORMANT` row has been seen by the owner.
- **AC-39** `[all]` **Given** copy recorded verbatim in the register — error sentences, refutations, empty states, the GST refutation paragraph, the split-coverage sentences, the worked-example step trace including the steps that did nothing — **when** the corresponding ops2 surface renders, **then** that copy is present as recorded, or the row is let go under AC-37.
- **AC-40** `[all]` **Given** the set of API endpoints the legacy console calls, **when** ops2 is complete, **then** each is either called by ops2 or recorded as deliberately unsurfaced with a reason. Machine-checkable, and a cheap cross-check on the register.
- **AC-40a**, **AC-40b** — see §8.1.

### 9.9 Derivation (D8, D9) `[R3]`

- **AC-41** **Given** a line the estimator produced, **when** staff open its derivation without leaving the record, **then** it presents: the origin file, the extracted text, the requirement derived, the reasoning, and the candidates considered.
- **AC-42** **Given** the candidates for a line, **when** they are shown, **then** each carries its rank and its human-readable reason as recorded in `candidate_result`, and the losing candidates are reachable in one action from the line.
- **AC-43** **Given** evidence rows whose `page_no`, `sheet_ref` and `region_json` are NULL — which is all of them in production — **when** the derivation renders, **then** the absence is stated in words on screen, and the section is neither blank nor omitted.
- **AC-44** **Given** the derivation surface, **when** it renders, **then** every value shown is present in the data; no candidate, reason, score or page reference is invented or inferred for display.
- **AC-45** **Given** a customer on the phone asking "why that one, and why not the cheaper one?", **when** the reviewer answers, **then** both answers are readable from the record without opening a file, a PDF, or another destination.
- **AC-45a** **Given** a line whose values were extracted from a schedule, **when** its derivation is opened, **then** the **original extracted value** of each field is visible alongside the current value — which is both what §4's "trivial reversal" needs (AC-17) and what makes AC-7a's baseline auditable by a human.

### 9.10 Work — the attention surface and the triage sort (D12, D10) `[R4]`

**The attention surface carries two item classes in phase 1**, decided at the revision-3 gate. Owner: *"key information at this point is: orders requiring attention, product catalogue gaps. Everything else can be phase 2."* The four items moved to phase 2 are recorded in §6.2 rather than deleted.

> `ASSUMED:` **"orders requiring attention" is read in the general sense of jobs/work** — the existing five "needs us" groups spanning quotes and orders both — **not solely committed orders.** Reading it narrowly would leave the primary work of the console, quotes awaiting review, off its own landing page, which contradicts §4. Tagged so it can be vetoed at review.

- **AC-46** **Given** catalogue products missing pricing information, **when** the landing page opens, **then** those products are named on it, with a route to the screen that fixes them.
- **AC-46a** **Given** work requiring attention — the five "needs us" groups as they exist today — **when** the landing page opens, **then** each non-empty group is present with its count and its exact singular/plural copy, and selecting one applies the matching filter on the queue rather than merely switching destination.
- **AC-47** — **struck at the revision-3 gate.** Delivery zones configured but unpriced moved to phase 2 (§6.2). *(Recorded rather than renumbered so the deferral is visible, not invisible.)*
- **AC-48** **Given** nothing at all needing attention, **when** the landing page opens, **then** it says so in a sentence rather than rendering empty regions.
- **AC-49** **Given** the landing page, **when** it renders, **then** it carries no lifetime-revenue or total-money-earned metric (D12).
- **AC-49a** **Given** the landing page in phase 1, **when** its content is enumerated, **then** it carries **only** the two decided item classes, and none of the four phase-2 items appears.
- **AC-50** **Given** a record, **when** staff mark it as with the manufacturer, **then** the record shows that state and its queue row shows it.
- **AC-50a** **Given** a queue containing work in every waiting state, **when** it is sorted, **then** the order is **Us → Manufacturer → Customer → Nobody**, then by longest waiting, and the sort is not user-overridable.
- **AC-51** **Given** a record marked with the manufacturer, **when** staff clear the mark, **then** it clears everywhere it was shown, with no further consequence.
- **AC-52** **Given** the "with manufacturer" state, **when** it is set or cleared, **then** no message, email or notification is sent to anyone, and no messaging surface exists anywhere in ops2 (D10).

**A note for the architect, because this is not the sort change it looks like.** `waitingOn` is today a three-value union (`worker/lib/lifecycle.ts:56`) **derived** from lifecycle state (`:72`: `stage === "after_sales" ? "Nobody" : CUSTOMER_WAITS.has(key) ? "Customer" : "Us"`), and ranked Us 0 / Customer 1 / Nobody 2 (`worker/routes/ops.ts:398`). "Nobody" is the after-sales bucket — finished business, nothing owed either way — and it stays last. Adding "Manufacturer" is **a type change and a derivation change**: unlike the other three it is *set by a human*, not derived from stage or status, so `lifecycleOf` gains an input it does not currently take and `waitingOn` becomes a mix of derived and stored. That seam is R4's design work.

### 9.11 Installability (D14) `[R8]`

- **AC-53** **Given** ops2 on each reference device, **when** the add-to-home-screen flow is used, **then** it installs and launches into the console, passing Cloudflare Access as it does in the browser.
- **AC-54** **Given** an installed instance and a newer version deployed, **when** it is launched, **then** it runs the newer version.
- **AC-55** **Given** an installed instance with no connectivity, **when** it is launched, **then** it fails loudly per I6 and does not present cached data as current.
- **AC-56** **Given** ops2 installed, **when** its capabilities are enumerated, **then** it requests no push permission and registers no push subscription (deferred, §6.2).

---

## 10. Abuse cases — the forbidden actions, and the attempts that prove they fail

**Why this section exists.** ops2 reaches financial PII (payout bank details, ABNs), customer pricing, and every project in the business, behind an authentication boundary this project must not weaken. `CLAUDE.md` requires negative criteria for such a surface, specified up front rather than discovered at review.

**Binding on the tester: a criterion in this section verified by code inspection alone is NOT verified.** The forbidden action must be attempted against a running system and the denial recorded — status, body, and the absence of any state change. **Where a criterion concerns an identity that does not exist in production — the manufacturer role most of all — the tester constructs it and attempts the action anyway.** A refusal that has never been tried is not a control.

**Two general rules for every criterion below.** A refusal changes nothing. And where the requester is not a founder — a partner, or a role without reach — a refusal must not disclose whether the thing exists: "not yours" and "no such thing" answer identically, the discipline `worker/routes/auth.ts:35` already applies on the customer side.

### 10.1 The Access boundary (C8 — must be unchanged, and must stay closed)

- **AC-57** `[R2]` **Given** Cloudflare Access is configured (team domain and audience both set), **when** a request reaches the Worker with **no** `Cf-Access-Jwt-Assertion` header, **then** it is refused, and no internal-session fallback authenticates it. *(This fail-closed property exists today; the criterion is that ops2 does not regress it.)*
- **AC-57a** `[R2]` **Given** production configuration (Access configured), **when** the ops OTP sign-in routes are called directly — including `POST /api/ops/auth/verify` **on the customer hostname**, which is served by the same Worker — **then** each returns **404**, no staff row is created, no existing customer row is flipped to `type='internal'`, and the admin bootstrap does not fire. **Given** a non-production configuration with Access unset, **then** the same routes work and the sign-in screen renders. *(This guard closed a real hole: before it existed the route reached `findOrCreateInternalUser` with no assertion at all — an Access-free write into the identity table. It is register entry D-2, it is invisible in production, and a rebuild is exactly where it gets reopened.)*
- **AC-58** `[R2]` **Given** a validly signed Access assertion issued for a **different Access application** (a different `aud`), **when** it is presented to ops2, **then** it is refused.
- **AC-59** `[R2]` **Given** an assertion that is expired, not-yet-valid, signed by an unknown key, signed with `alg: none`, or bearing a different issuer, **when** each is presented, **then** each is refused, and none authenticates.
- **AC-60** `[R2]` **Given** a real customer's `apertly_session` cookie for a `type='customer'` account, **when** it is presented to any `/api/ops/*` endpoint under production configuration, **then** it is refused and no ops data is returned.
- **AC-61** `[R2]` **Given** a person removed from the Cloudflare Access policy whose ops2 role row still exists, **when** they attempt to reach ops2, **then** they are refused at the perimeter. **And given** a person still on the Access policy whose role has been revoked in ops2, **when** they reach ops2, **then** every capability is refused. **Either revocation alone is sufficient** (I7).
- **AC-62** `[R2, R8]` **Given** the ops2 deploy, **when** the Access configuration is compared before and after, **then** the policy, the audience, the team domain and the MFA requirement are byte-for-byte unchanged.

### 10.2 Permission — privilege and elevation

- **AC-63** `[R2]` **Given** a signed-in non-admin staff member, **when** they call the role-assignment endpoint directly for themselves or for anyone else, **then** 403, and no `role` value changes in the database.
- **AC-64** `[R2]` **Given** any staff member, **when** they submit a `role`, `permissions` or equivalent field inside a request body for an endpoint that is not the role-assignment endpoint — their own profile, a record update, a settings save — **then** the field is ignored or rejected, and their role is unchanged.
- **AC-65** `[R2]` **Given** a Reviewer, **when** they request, one at a time, each rate-card, option-pricing, catalogue-configuration, program-settings, referral-payout and staff-administration endpoint by direct URL — bypassing the console's navigation entirely — **then** each returns 403 and no data from the refused surface appears in any response body.
- **AC-66** `[R2]` **Given** a manufacturer-role identity, **when** they request every ops2 data endpoint, **then** each returns 403 and no project, quote, price, customer, payout or catalogue data is returned. *(The phase-2 surface is not built; the boundary is enforced now — §3.3, §6.2, §9.7.)*
- **AC-66a** `[R2]` **A dormant role must not become a live hole.** **Given** no manufacturer account exists in production and none ever has, **when** the tester **creates one** and signs in as it, **then** every ops2 data endpoint refuses it, and **given** a future deployment sets `MANUFACTURER_EMAIL_DOMAINS` or an admin grants the role deliberately, **then** the same refusals hold without any further change. **And given** ops2's navigation, **then** the absence of a destination for that role is never the thing doing the refusing. *(Register entry D-1: the surface is deferred, the enforcement is not. This criterion is the reason deferring it is safe.)*
- **AC-67** `[R2]` **Given** a manufacturer-role identity, **when** they open ops2, **then** the console offers only what their role permits — **and** the refusal in AC-66 holds regardless, because hiding a destination is not a control.
- **AC-68** `[R2]` **Given** a deep link (D11) to a record a role may not read, **when** it is opened by that role, **then** it is refused, and the refusal does not disclose whether the record exists.
- **AC-69** `[R2]` **Given** any endpoint added anywhere in ops2, **when** it is reached by an identity with no role, **then** it refuses — endpoints are staff-gated by default and open only by explicit opt-in, never open unless someone remembered a gate.

### 10.3 Financial PII (payout details, ABNs)

- **AC-70** `[R7]` **Given** a Reviewer, or any role without payout permission, **when** they request the referral payouts screen or any of its endpoints, **then** 403, and no BSB, account number or account name appears in any response body.
- **AC-71** `[R7]` **Given** the referrals list screen, **when** its response body is inspected in full, **then** it contains no BSB and no account number for anyone (referral spec AC-102).
- **AC-72** `[R7]` **Given** an Admin reading payout details on the payouts screen, **when** the read occurs, **then** a `payout_details_access` row is written with `actor_user_id ≠ subject_user_id`, and the row records the fact of access and never the value (referral spec AC-104, AC-82).
- **AC-73** `[R7]` **Given** any ops2 request that touches payout details, **when** Worker logs and any telemetry for that request are inspected, **then** no BSB and no account number appears in them.
- **AC-74** `[R7]` **Given** the `payout_details_access` log, **when** every ops2 route, screen, report, export and filter is enumerated, **then** none reads it — it has a write path and no reader anywhere (referral spec AC-82).
- **AC-75** `[all]` **Given** any ops2 surface other than the payouts screen, **when** its response bodies are inspected, **then** no full bank account number is returned.

### 10.4 Data-scoping and injection

- **AC-76** `[all]` **Given** any ops2 list or record endpoint that accepts an identifier, **when** an identifier is supplied for an entity of a different type, a malformed identifier, or one belonging to a record the role may not reach, **then** the request is refused and no data is returned.
- **AC-77** `[R6]` **Given** a Reviewer, **when** they attempt a rate-card write by replaying a captured admin request with their own identity, **then** 403 and the rate card is unchanged, at the same version.
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

**Delivery zones.** A zone with NULL rates is *unpriced* — configured but not yet given numbers — and that is a distinct state from missing. All fifteen production zones are currently in it. *(Its landing-page surfacing is phase 2 — §6.2 — but the record must still be honest about it.)*
- **AC-85** `[R1]` **Given** a project whose zone resolved as `unpriced_table`, **when** its delivery figure renders, **then** it reads as unpriced, distinctly from `$0` and distinctly from an unresolved zone, and the zone basis (`postcode_zone` / `fallback_zone` / `unpriced_table`) is stated.

**File scanning fails closed, and the console must not undo that.** The scanner returns `unknown` for an unrecognised engine or a failed check, and *an `unknown` verdict is never treated as clean*. Register entry D-3.
- **AC-85a** `[R5]` **Given** files with each scan verdict — clean, infected, pending, and `unknown` / `scanner_misconfigured` — **when** each renders on the record and in the global Files list, **then** each is shown distinctly, no unknown or unscanned file is presented as safe or offered for download, and the scanner's `reason` is rendered where one exists.

**Composites.** The coverage sentences are never a veto (units may span more or less than the opening — "Allowed — recorded on the line"), and incompatible frames stay selectable and marked. Both are I1 in miniature and must survive.
- **AC-86** `[R1]` **Given** units that span more or less than the opening, **when** staff save, **then** the save succeeds and the divergence is recorded on the line rather than blocked.

**Dates and identity.** One date format across the whole console (two exist today). The public reference is the anchor and is never renamed; the order number renders alongside where an order exists; an anonymous submitter's submit-time contact details still render.

**The manufacturer boundary at phase 1.** A manufacturer-role identity has no landing page to land on, and — per register entry D-1 — no Enquiries destination either, because that surface is deferred. The console must not crash, must not present an empty shell, and must give them a way to see who they are signed in as and to sign out.
- **AC-87** `[R2]` **Given** a manufacturer-role identity constructed for the test, **when** they sign in to ops2, **then** they reach a coherent screen that states they have no working area yet, they can see their identity, and they can sign out — and every data endpoint still refuses them (AC-66a).

---

## 12. Rollout, the fire escape, and deletion `[R8]`

D2 is the owner's decision and is not reopened: *"once new version of ops is ready — we will start using it and delete the old one."* No parallel running as a way of working. That is not the same as no fire escape during the changeover, and §7 of the conclusions sets out the mechanism, which this spec adopts unchanged.

- **Switch-over and deletion are two events**, different commits, different deploys, separated by a soak. Between them the old console is in the bundle but not routed by default: reachable by the two founders at an unadvertised path, used only if ops2 fails at something. Nobody works in it.
- **Rollback is a deploy, not a rebuild.** `wrangler versions upload` for a preview that does not move production traffic, then `wrangler versions deploy` to promote — the procedure `CLAUDE.md` already mandates for sensitive surfaces.
- **The one real hazard is RBAC, and C8 narrows it.** Authentication does not change, so no rollback can leave anyone unable to *sign in*. What changes is role **assignment**. So the migration must be **additive**: the existing domain-based role path keeps working, untouched, for as long as the old console exists. Both resolution paths run simultaneously through the soak. Removing the domain path is part of **deletion**, not switch-over. This is why AC-34 tests a **write**, not a sign-in.
- **Deletion** removes the old console, its Vite entry, and the domain-based identity path in one commit — trivially revertible from git. **It also removes the legacy manufacturer tab branch** (register entry D-1), which is the moment that dormant code actually leaves the build.

- **AC-88** **Given** switch-over is deployed, **when** a founder opens the unadvertised legacy path, **then** the old console loads and works.
- **AC-89** **Given** the soak, **when** deletion is proposed, **then** the register's gate (AC-38) has passed and the owner has judged ops2 ready. No fixed soak period is imposed (O2, closed).
- **AC-90** **Given** deletion is deployed, **when** the domain-based role path is removed, **then** every ops2 identity resolves by granted role alone and no capability is lost — including the manufacturer role, which after deletion exists **only** as a per-user grant (AC-32) and whose refusals are unchanged (AC-66a).

---

## 13. The referral program's ops surface

The referral program's ops screens are being built **into the legacy console right now, as disposable work** (D17):

> "yes, it will build some screens into legacy, it's about to start doing that."

**ops2 carries the referral program's *requirements*, not its screens.** The legacy screens are not ported, re-skinned or copied; the requirements are re-satisfied in ops2's own structure and re-tested there.

**The requirement set**, from `docs/specs/referral-program.md` §8.4 and §8.5 and `docs/design/referral-program-ux.md` §8:

| Requirement | Source | ops2 disposition |
|---|---|---|
| **Program configuration** — every number, the On/Off switch, the two side switches, a live restatement of what the settings mean, a stale-save refusal with its own copy, and the switch-off confirmation stating that nothing already promised is withdrawn. | spec §8.4a, ux §8.1 | In scope, Admin only. |
| **Referrals list** — filter, search, per-row void with a mandatory reason and un-void, the referred order linked to its record, review-flag detail on the row. **No banking on this screen.** | spec §8.4b, ux §8.2 | In scope, Admin only. |
| **Payouts** — grouped per referrer, one transfer each, deadline-flagged against the promised timeframe, per-row record-payment with a bank reference, per-row reversal with a required reason, payments-made history with frozen bank details, CSV export for the accountant. **The one screen where an actor sees another person's banking.** | spec §8.4c, ux §8.3 | In scope, **Admin only** (AC-70). |
| **The referral link action at account creation** — takes a **code and nothing else**, calls the same `recordReferral` gates, shows each refusal with its specific reason (internal surface), records `source: 'manual'`. **No path by which a referrer supplies a mate's details.** | spec §8.4d, AC-78 there | In scope. |
| **Attention-surface row** — referral payouts ready, only when there is money waiting, with its age when over promise. | ux §8.4, spec AC-46 | **Deferred to phase 2** by the revision-3 attention-surface decision (§6.2). Becomes a `DROPPED` register row the owner sees at R7. **The payouts screen itself is unaffected** — only its landing-page prompt is deferred, so the weekly run is navigated to rather than prompted. |
| **On the record** — the referral discount and its review flags (shared ABN / phone / business name) visible **before** a reviewer issues. Ops-only, never serialised to a customer response. | spec AC-58, ux §8.5 | In scope, visible to Reviewer — it exists to change a reviewer's decision before issue. |

**Its abuse criteria are AC-70 to AC-75 above**, which restate the referral spec's AC-102, AC-103, AC-104 and AC-82 against ops2's permission model. Note that referral spec AC-103 refuses **manufacturer partners** every referral endpoint — under ops2 that refusal is carried by AC-66a, which tests it with a constructed identity rather than assuming an absent one.

**The requirement set is in flight, and this is how that is handled:**

- **AC-91** `[R7]` **Given** R7 begins, **when** its design starts, **then** the referral requirement set is pinned to a named commit of `docs/specs/referral-program.md` and `docs/design/referral-program-ux.md`, recorded in the carry-across register.
- **AC-92** `[R7, R8]` **Given** the pinned set and the then-current documents at switch-over, **when** they are compared, **then** every difference is either satisfied in ops2 or recorded as let go under AC-37.
- **AC-93** `[R7]` **Given** ops2's referral surface, **when** the referral spec's ops criteria (AC-38 to AC-47, AC-58) are executed against it, **then** each passes against ops2 — not against the legacy screens. **Except its AC-46's dashboard row**, deferred above and recorded as such.
- **AC-94** `[R8]` **Given** the legacy console is deleted, **when** the weekly payout run is performed, **then** it is performed entirely in ops2, with no recourse to the fire escape.

---

## 14. Domain vocabulary the architect must add to `CONTEXT.md`

`CONTEXT.md` is the architect's to maintain. These terms are load-bearing in this spec and it lacks all of them.

| Term | What it must capture |
|---|---|
| **Record** | The merged plane of a project and its order, addressed as one thing in ops. `Project` remains the container; `Record` is what ops opens. Needed because ops2 stops treating orders as a separate destination. |
| **Derivation** | The chain from an uploaded schedule to a proposed line: origin, extracted text, requirement derived, candidates considered, selection. Words and data, never drawings (D8). |
| **Candidate** | One evaluated product × variant for an opening, carrying per-filter pass/fail, a human-readable reason, six score components and a rank. Recorded in `candidate_result`. **A losing candidate is a first-class thing ops shows, not an internal artefact** (D9). |
| **Original information** | The value a line field first carried, whatever its origin — extracted from a schedule, submitted by the customer, or proposed by the estimator. **The baseline the divergence record compares against** (§9.2). One resolved original value per field. |
| **Divergence record** | The single fact recorded on a quote **at issue** naming every line field whose issued value differs from its original information. One per issue, never per save or per line, never customer-facing (C5, D19). |
| **With manufacturer** | A state on the work meaning it is waiting on the manufacturer. **Orthogonal to `Phase`** — it is not a phase. It is the fourth value of `waitingOn`, and **the only one that is set by a human rather than derived** from lifecycle state (§9.10). |
| **Attention surface** | The console's landing page: what needs doing or is critically wrong. Explicitly not a metrics dashboard (D12). Two item classes in phase 1. |
| **Role** | A per-user grant deciding what a signed-in person may do — **Admin, Reviewer, or Manufacturer partner** (§9.7). **Distinct from Cloudflare Access**, which decides who they are. Both are required; either revocation locks someone out (C8). |
| **Manufacturer partner** | A person admitted through the same Access policy who is **not staff**: refused every data endpoint, enforced per endpoint rather than by hiding a destination. Their working area is phase 2; their refusal is now. |
| **Dormant capability** | Code that implements a capability which has never been reachable in production, because a variable is unset, a guard excludes it, or no user of the required kind exists. **Not dead code and not a regression** — a decision about the future that must be made visible rather than left to scope silence (§8.1). |
| **Staff** *(sharpen)* | Today's entry describes staff-ness as an axis on an account. It should also record that staff-ness no longer implies uniform capability once RBAC ships. |

---

## 15. Assumptions

Every `ASSUMED:` in this document, collected so none is buried. Each is vetoable at review.

| Tag | Assumption | Where |
|---|---|---|
| A-1 | A quote issued with no divergences writes an explicit empty divergence record, so "agreed with the original" is distinguishable from "never issued". | AC-8 |
| A-2 | Re-issuing a quote writes a new divergence record and retains the prior one, rather than overwriting. | AC-9 |
| A-3 | The conversation-pace budget is p95 ≤ 1200 ms from input to both totals updated, on the reference devices over a mobile connection. The requirement that both totals move together is not assumed. | AC-16 |
| A-4 | **"Orders requiring attention" is read as jobs/work in general** — the five "needs us" groups spanning quotes and orders both, not solely committed orders. Reading it narrowly would leave quotes awaiting review off the console's landing page. | §9.10, AC-46a |
| A-5 | Ops shows the project owner's GST mode as primary, labelled, with any reviewer toggle being a view only that never writes the customer's preference. | AC-79, AC-80 |
| A-6 | The tracking issue on `siaribuild/apertly` carries build regions as sub-issues and is **not** labelled `wayfinder:map`, because the frontier is empty. | §7 |
| A-7 | `DORMANT` is a distinct register state rather than a use of `DEAD` or `DROPPED`, and dormant entries carry the same owner-visibility requirement as `DROPPED`. | §8 |
| A-8 | The manufacturer Enquiries view (D-1) is let go rather than carried, on the basis that it has never had a user and its surface is deferred. **The owner sees this as a register entry; it is his to reverse.** | §8.1 |
| A-9 | For a line the customer configured themselves rather than one parsed from a schedule, the **original information** is the customer's submitted values. | §9.2, §14 |
| A-10 | The referral payouts **landing-page row** is deferred with the other four phase-2 attention items, while the payouts **screen** stays fully in scope. | §13 |

---

## 16. Decisions needed

**None. This list is empty.**

All five decisions raised at revision 1 were answered by the owner and are folded in: roles (§9.7), the triage sort (§9.10), the divergence definition (§9.2), the attention surface (§9.10 and §6.2), and the decomposition (§7). The revision-2 review finding was a silence to fix, not a scope question, and its disposition is a register entry the owner rules on under AC-37.

**Two things to watch at review rather than decide now**, both tagged above so they can be vetoed rather than discovered:

- **A-4** — my reading of "orders requiring attention" as work in general. If the owner meant committed orders only, AC-46a narrows and the landing page loses quotes-awaiting-review, which would be a significant change to the console's front door.
- **A-10** — deferring the referral payouts landing-page row. It is the one place where the attention-surface cut meets a carry-across obligation from work shipping right now. The loss is small (navigate rather than be prompted) and the payouts screen is untouched, but the owner should see it at R7 under AC-37.
