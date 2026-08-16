# Ops2 — grilled conclusions

**Status:** input to the product-manager. Produced 2026-08-16/17 by grilling the
owner across seven rounds (pipeline stage 0, `CLAUDE.md`). Unlike everything
else in this directory, **this document is binding**: it records decisions the
owner made, not proposals awaiting approval. Where it contradicts `UX-SPEC.md`,
`UX-AUDIT.md`, `README.md` or either mock, this wins — those are exploratory and
explicitly not a rule set.

Quotations are the owner's own words and are reproduced verbatim so the spec can
carry them without paraphrase drift.

---

## 1. Actors and their needs

### 1.1 Founder-operator (×2) — the only actor today

> "OpenFrame at the moment is two-men show, both founders, both super-admin type
> users."

Two people, both with unrestricted access, performing every operational task
between them: reviewing machine output, consulting customers, negotiating
manufacturer pricing, maintaining the catalogue and rate cards, handling
enquiries. No division of labour by role — the same person is reviewer and
catalogue maintainer on different days, often within the same hour.

**What they need, and why:**

- **To not lose a day.** The governing constraint of the entire project:
  > "Responsiveness is everything, speed is money. We can't afford waiting the
  > whole day to open the request in the evening — that's the day lost as we
  > would be able to follow-up with questions and contacting manufacturer only
  > the next day."

  The cost of a delayed glance is not inconvenience; it is a working day, because
  both the customer follow-up and the manufacturer call slip past the point where
  either can be answered that day.

- **To work while moving, on any device, at any width.** Many activities run in
  parallel; the console is used between other tasks, one-handed, on both iOS and
  Android, and on a foldable *held open with other apps beside it*:
  > "use it open with apps running in parallel. it's a workhorse!!"

- **To conduct a consultation, not to file records.** The estimator's output is
  the beginning of a conversation, not a document to approve:
  > "We are not expecting customer to know our products. We are not expecting
  > anyone to commit to buying products worth thousands of dollars without
  > detailed consultation and review whatever they submitted. It is an
  > interactive process of calling the customer, finding their needs,
  > preferences, explaining product nuances. Then talking to manufacturer to get
  > their final pricing set. It therefore can involves changing any parameters,
  > any options, including pricing."

- **To have the machine's reasoning on screen, ready to consume.** Not
  retrievable — present:
  > "we don't want, for example, to open pdf with building drawing and search for
  > Uw value — it should be on the screen, ready for consumption."

- **To remain the authority.** See §3. The human overrides; the system never
  obstructs.

- **To be able to hand the tool to someone with no training.** The quality bar,
  figuratively stated:
  > "we aim for 'even my mum could do it' quality"

### 1.2 Limited-access staff — designed for, not yet hired

Growth is intended, and the permission model exists to serve it:

> "identity has to move to RBAC, per user. This will also set foundation for
> future hires with limited access. For example, having someone to review quotes
> but not to have admin accesses, etc."

**Need:** to perform one part of the job — reviewing quotes — without inheriting
administrative reach over pricing, catalogue or users.

### 1.3 Manufacturer partner (AMJ) — phase 2, boundary designed now

The showrooms are the manufacturer's. Requests for physical inspection are
currently forwarded to them by email:

> "the showroom are owned by manufacturer, and requests for physical inspection
> need to be passed through to them. We are forwarding email notifications on
> requests, but we though it would be so much more easier for them to login and
> update status on what has happened. […] it also just access/visibility feature
> — they need to be able to see a single working area, not the rest."

**Need (phase 2):** to see the appointment/inspection requests that concern them,
and to record what happened — nothing else. A later ambition, explicitly raised
when deep links were discussed, is direct price maintenance:

> "if we could get manufacturer on board to use the platform to update pricing
> directly […] no more sending out emails/pdfs, no more manual reconciliation!"

**Not a customer of the platform. No multi-tenancy.** Access is internal, by
identity, for people the founders choose to admit.

### 1.4 The customer — present but not a user

The customer never signs into ops. They are, however, **on the phone while the
console is being operated**, and their questions set the pace. Design
consequence: the reviewer must be able to answer "why does it say that?" and
"why not the cheaper one?" without leaving the screen, and to change what they
are looking at while the customer listens.

---

## 2. The thesis, corrected

The brainstorm proposed: *ops adjudicates machine output against source, one line
at a time, then releases.*

**That is too passive.** Confirmed in round 3: edits happen **with the customer on
the phone** —

> "change while on the phone. Recalling what was said discussing an order from
> 20-lines of products — that's a tough one to do. Taking notes — that requires
> another device or notebook."

The console is an instrument used *during* a conversation. The owner regards
consultation and adjudication as inseparable —

> "One cannot adjust anything without gathering information and requirements,
> which is what consultation (or questioning) is for."

— and that is the settled framing. Adjudication is real, but it is performed
conversationally and its normal outcome is a change, not a tick.

**Design consequences, all load-bearing:** edits fast enough to keep pace with
speech; a total that moves as options change; trivial reversal when a customer
changes their mind back; and per-line comments captured while the reason is still
in the room (per-line comments already exist and are used).

---

## 3. The non-negotiable rule

> "AI product selections, and thermal modelling is not authoritative in the first
> place. The primary function here it to eliminate work required by a human to be
> as accurate as in-humanly possible. It is therefore a non-negotiable rule that
> a human has authoritative decision to do and override anything."

Everything the estimator produces is a **proposal**. No screen may block, gate,
or require justification for a human decision. Warnings are permitted only if
unobtrusive:

> "Happy to have a unobstructive warning that something does not match with AI
> stated outputs/requirements, but it can not interfere with human's work."

**Recording is at quote level, at issue time, once:**

> "Happy to have a decision on a quote level logged in the system, recorded at
> the issuing of the final quote state — do not want the platform to be polluted
> on every save or every order line changed."

So: no per-save audit spam, no per-line acknowledgement ceremony. When a quote is
issued, the divergences between what the system proposed and what the human
decided are recorded as one fact about that quote.

---

## 4. Settled decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Ground-up rebuild, not a restyle.** Both the structure and the finish are wrong. | "Current ops console is a mess. […] it was never designed from UX perspective." |
| D2 | **Replacement, then deletion. No parallel running.** Ops2 is not adopted until it is complete; the old console is then deleted. | "once new version of ops is ready — we will start using it and delete the old one." |
| D3 | **Full capability parity at every width.** Everything works on a phone. | "everything works on the phone" — justified by the lost-day cost, §1.1. |
| D4 | **Neither failure mode is acceptable.** No mobile app stretched across a desktop; no cramped desktop crushed onto a phone. | "I will not accept mobile app on big screen, nor cramped interface in the small screen." |
| D5 | **RBAC ships inside ops2**, per user. It replaces domain-based *role assignment* — **not** authentication, which stays with Cloudflare Access (see C8). | "I'm happy RBAC to go with ops2 exclusively. We're not sharing access to legacy ops to anyone, nor I see reason to invest any time improving it." |
| D6 | **No component framework decision is pre-made.** The architect costs the options against D4 as the criterion. Fluent UI 2 is rejected; Ionic was never used by any mock. | "Whether it can be achieved via Ionic, something else, or combination of frameworks — that's beyond my knowledge. I will judge the output." |
| D7 | **Workspace (the record) is built first**, though the switch waits for everything. | "Workplace first; we won't switch until everything is done though." |
| D8 | **The derivation pane is built from words and data, not drawings.** Origin, reasoning, extracted text, the requirement, the candidates. The absent visual is stated, not blank. | Region rendering rejected as unrealistic: "typically information would be scattered across multiple pages". |
| D9 | **Losing candidates are shown, one tap away, ranked, with reasons.** | "the customer, home owners in particular, might want to save money and choose the next-worse solution that is cheaper despite marginally failing to meet requirements." |
| D10 | **A "with manufacturer" state exists** on the work, visible in the queue and on the landing page. Not a messaging system. | "I can see a flag that something is with manufacturer useful." |
| D11 | **Deep links to every job and line.** Cheap from the start, expensive to retrofit. | "if it is cheap from the start, then 'yes'." |
| D12 | **The landing page is an attention surface**, not a metrics dashboard. | "the dashboard, as a landing page, should surface actions needed to be performed by us, or information of critical importance, such as products in the catalogue missing pricing information […] Not fussed about anything non-critical such as the amount of money we made in total." |
| D13 | **Audit and Files are record-scoped primarily, with global views retained.** | "keep both. If I'd have to choose one, I'd go with per record. But global list is cheap." |
| D14 | **Installability (add-to-home-screen) is part of ops2.** Not an App Store / Play Store app. | "part of it." |
| D15 | **Connection loss must fail loudly, never silently.** Offline editing is not required. | "fine with edit disappearing but it needs to fail gracefully — it cannot fail silently." |
| D16 | **No presence indicators in phase 1**, cheap or otherwise. | Round 4, Q17: "no". |
| D17 | **Referral's ops surface is built into legacy ops now, as disposable work.** Ops2 carries its *requirements* across, not its screens. | "yes, it will build some screens into legacy, it's about to start doing that." |
| D18 | **Acceptance is the owner's judgement on quality**; the PM stage still holds completeness criteria (nothing that works today may silently disappear). | "I will be accepting that and I consider myself competent in UX." |
| D19 | **No customer-facing note when a human overrides a requirement.** The divergence is recorded internally at quote issue (§3) and stays internal. | "no need to client facing notes." |

---

## 5. Hard constraints

- **C1 — Width, not device.** The Fold 7 is used open with other apps beside it,
  and can change width mid-session. Layout must respond to the space actually
  given, moment to moment. Any approach that switches on device class is
  disqualified. The narrowest target is the folded cover screen.
- **C2 — Both platforms.** Late-model iPhone and Galaxy Fold 7. No legacy devices.
- **C3 — Conversation pace.** Edits, totals and reversals must keep up with
  speech (§2).
- **C4 — Human authority is absolute** (§3). No blocking gates.
- **C5 — Recording is quote-level at issue**, never per-save (§3).
- **C6 — Internal only.** No multi-tenancy, ever. Access by identity, admitted by
  the founders.
- **C7 — No fallback console, once deletion has happened.** D2 means that after
  switch-over completes there is nothing to retreat to; the carry-across list is a
  hard gate, not a nice-to-have. **Switch-over and deletion are two separate
  events** — see §7, which is how D2 is honoured without betting the business on a
  single deploy.
- **C8 — RBAC must work with Cloudflare Zero Trust, and MFA is retained.**
  Owner's words: *"I have full intention to keep Cloudflare Zero Trust/MFA setup.
  Whatever RBAC implementation is, it MUST work with CFZT."*

  The two layers are distinct and compose; nothing here weakens the perimeter:

  - **Cloudflare Access answers *who you are*.** It enforces the policy and the MFA
    challenge, then injects a signed `Cf-Access-Jwt-Assertion`, which the Worker
    verifies against the team JWKS and a fixed audience
    (`worker/lib/staff.ts:174`). **Unchanged by this project.** Nobody reaches ops2
    without passing Access first, exactly as today.
  - **RBAC answers *what you may do*.** Once Access has established the identity,
    the application decides permissions for that person. Today that decision is
    made from the email *domain* (`staff.ts:34`) — which is what D5 replaces, and
    why a partner on an `@openframe.com.au` address is currently indistinguishable
    from a founder.

  Therefore admitting anyone — a future hire, the AMJ contact — is **two gates, not
  one**: added to the Access policy, *and* granted a role. Neither alone is
  sufficient, and revoking either is sufficient to lock someone out.

  **Architect decision-point (not assumed here):** whether role membership lives in
  Cloudflare Access groups (managed in the CF dashboard, arriving as JWT claims) or
  in the application database per user (managed from an ops2 admin screen). The
  owner's framing — "per user", with future limited-access hires in mind — points at
  the database, but this is to be costed at the design stage, not decided in this
  document.

---

## 6. Deferred — phase 2 or later

- Manufacturer login and their single working area (appointment/inspection status).
- Manufacturer direct price maintenance.
- Live presence ("X is looking at this now").
- Push notifications — deliberately deferred until the console has been used for a
  fortnight, so the "what is worth interrupting me for" decision is made from
  experience. Installability (D14) is what makes iOS push possible later.
- Extractor work to emit page number, sheet reference and region geometry — its own
  feature with its own justification, never a dependency of this redesign.
- Offline editing with conflict resolution — explicitly not wanted (D15).

## 7. Rollout and rollback

D2 ("start using it and delete the old one") is the owner's decision and is not
reopened here. What follows is how it is executed without a single bad deploy
costing a working week — the constraint says *no parallel running as a way of
working*, which is not the same as *no fire escape during the changeover*.

**The two events are separate.** Switch-over — ops2 becomes what `ops.*` serves —
and deletion — the old console leaves the build — are different commits, different
deploys, separated by a soak period. Between them the old console is still in the
bundle but not routed by default: reachable by the two founders at an explicit
path, unadvertised, used only if ops2 fails at something. Nobody works in it. It
is a fire escape, not a second office.

**Why this costs almost nothing here:** ops2 and the old console share one API,
one database and one Worker. There is no data migration to unwind, no second
deploy target, no divergent state. The old console's cost during soak is bundle
size.

**Rollback is a deploy, not a rebuild.** Cloudflare Workers versioning gives an
instant return to the previous version (`wrangler versions upload` for a preview
URL that does not move production traffic, then `wrangler versions deploy` to
promote — the procedure `CLAUDE.md` already mandates for sensitive surfaces). A
bad switch-over is reversed in the time it takes to promote the prior version,
not in the time it takes to restore a console.

**The one real hazard is RBAC — and C8 makes it narrower than it first looks.**
Authentication does not change: Cloudflare Access and its MFA challenge are
identical before, during and after the changeover, so no rollback scenario can
leave anyone unable to *sign in*. What D5 changes is **role assignment** — how the
application decides what a signed-in person may do. The old console reads that
from the email domain. If the migration repurposes or removes what it reads, then
rolling the Worker back restores a console whose users authenticate correctly and
then find themselves with no permissions, which is a subtler failure and easier to
miss. So:

- The RBAC migration must be **additive**. `migrations/` is append-only by house
  rule; this additionally requires that the existing domain-based role path keeps
  working, untouched, for as long as the old console exists.
- Both role-resolution paths must be live simultaneously through the soak.
  Removing the domain path is part of **deletion**, not switch-over.
- The rollback drill therefore has to check *authorization*, not just a sign-in:
  roll back, open a record, confirm the old console can still read and write it.
- The migration is a `migrations/` change, so it loads the `d1-migration-safety`
  skill first — a table rebuild once cascade-deleted production rows, and a clean
  local run proved nothing.

**Deletion proceeds only when:** the soak has elapsed with the fire escape unused,
and every carry-across item has been exercised on real work rather than ticked off
a list. Deletion then removes the old console, the old Vite entry, and the
domain-based identity path in one commit — trivially revertible from git, which is
the last line of defence and the reason the code being deleted is not the risk
people assume it is.

**Owner's call (O2):** how long the soak runs. My recommendation is *until you
have issued real quotes through ops2 across a full working week*, rather than a
fixed number of days — the measure that matters is whether the work has actually
been done in it, not how long it has been sitting there.

---

## 8. Open — for the PM to raise

- ~~**O1.**~~ **Closed 2026-08-17 — see D19.** No customer-facing note.
- **O2.** How long the soak in §7 runs before deletion. Recommendation: measured in
  real quotes issued through ops2 across a full working week, not in days elapsed.

---

## 9. Facts established against the code and production data

Gathered during the grill; all verified, not inferred.

| Fact | Source |
|---|---|
| The whole ops console is **4,322 lines** across 8 files. | `src/ops/` |
| The mess is concentrated: `ProjectRecord.tsx` 1,690 lines, `Pricing.tsx` 1,346. The other six average ~200. | `src/ops/` |
| **`candidate_result` holds 3,989 rows in production** — one per product × variant, with per-filter pass/fail, a human-readable reason, six score components and a rank. | D1 (remote) |
| **No ops endpoint reads it.** `worker/routes/ops.ts` mentions it once, in a comment at line 2068. | `worker/routes/ops.ts` |
| `evidence_items`: **1,000 rows; 0 have `page_no`, 0 have `sheet_ref`, 0 have `region_json`; 1,000 have `extracted_text`.** The write path binds real values (`pipeline.ts:703`); the extractor never produces them. | D1 (remote) |
| The ops evidence query omits `sheet_ref` and `region_json` entirely. | `worker/routes/ops.ts:1792` |
| Manufacturer identity is decided **by email domain** via `MANUFACTURER_EMAIL_DOMAINS`, which is **unset** — so nothing is a manufacturer today, and an `@openframe.com.au` address for a partner could not be distinguished from a founder. This is what D5 replaces. | `worker/lib/staff.ts:34` |
| Ops is served by host prefix (`host.startsWith("ops.")`) choosing `/ops.html`; Cloudflare Access protects that hostname and the Worker verifies a **single** `ACCESS_AUD`. | `worker/index.ts:191`, `worker/lib/staff.ts:187` |
| Consequence: ops2 on the **same host** under a path prefix needs no Zero Trust change and no edit to the authentication path. A new hostname would require a new audience, a list-valued `ACCESS_AUD`, and widening `isOps` — security-path changes for a cosmetic reason. | derived |
| Neither recovered mock uses Ionic (0 `<ion-` elements). Both are hand-rolled CSS on custom-property token blocks. | `docs/ops-redesign/mocks/` |

---

## 10. Rejected, and why

- **Adjudication-only framing** — too passive; edits happen live on a call (§2).
- **Region-highlighted drawing viewer** — the data does not exist, and even with it
  the model is wrong because provenance spans multiple pages (D8).
- **Fluent UI 2** — desktop heritage, fights D3/D4 on a phone.
- **A parallel-running transition** — the owner wants replacement and deletion (D2).
- **Building RBAC into legacy first** — no investment in a console being deleted (D5).
- **Blocking a non-compliant selection** — violates C4; the business genuinely does
  this, and a system that forbids it gets worked around.
- **Deleting the manufacturer role** — my recommendation, overruled: partner access
  is planned, so the boundary is designed now even though the surface is phase 2.
- **Presence in phase 1** — declined (D16).
- **Metrics dashboard** — declined in favour of an attention surface (D12).
