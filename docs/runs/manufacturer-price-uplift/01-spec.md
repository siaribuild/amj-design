# Spec — Manufacturer's price and uplift

> **SUPERSEDED IN PART, 2026-08-31.** The owner ruled that nothing is stored but
> the price: *"it's one price per line — price. Uplift is default per platform.
> The whole concept: help ops update prices without pulling their calculators."*
> Migration 0063, the `manufacturer_price` / `manufacturer_uplift_pct` columns
> and the dedicated endpoint are all DELETED. The panel computes and commits the
> resulting price through the existing override. Criteria that describe storing
> or re-reading the manufacturer's figure, the uplift, or a prefill from them do
> not apply. See `00-ask.md` D1 (corrected).

Stage 1, 2026-08-31. Built on the stage-0 grill conclusions in
`00-ask.md` (run with the owner, 2026-08-31). Nothing decided there (D1–D8) is
reopened here.

Open owner decisions: `DECISIONS.md` in this folder (4 items). Every point that
depends on one is tagged `ASSUMED:` below with its decision number.

---

## 1. Problem and the actor it serves

**Actor: Staff, Estimator persona** (`CONTEXT.md` → Staff / Estimator persona),
working on the ops2 line page.

In their terms:

> *"AMJ gives me a price per line, usually on the phone. I have their number;
> give me ours, and show me your working before I commit it."*

Today the only way in is the existing price override: the estimator does the
margin arithmetic in their head or on paper and types the finished figure. The
platform then holds a number whose origin nobody can reconstruct — what AMJ
quoted, and what margin was taken on it, exist only in the estimator's memory.

This feature takes the manufacturer's figure as the input, applies an uplift the
estimator can see and change, and stores both facts on the line beside the
resulting price. The goal is to simplify ops work, not to change what any
customer sees.

**The customer** is affected but not served directly: they see the resulting
line price and nothing about the manufacturer's figure, the uplift, or the
arithmetic (grill D4).

**Sensitivity.** The manufacturer's price is commercially sensitive cost data.
It is staff-only: never on a customer surface, and never readable by a
Manufacturer partner account (`CONTEXT.md` → Manufacturer partner). Abuse-case
criteria below are executed for real by the tester.

## 2. Acceptance criteria

### Entry and arithmetic

1. **Given** a staff user on an ops2 line page for a line with a price,
   **When** they open the Price panel,
   **Then** a SidePanel opens (not a navigation to a new page) containing: the
   entry-basis switch, the manufacturer's price field, the uplift field, the
   three-row arithmetic, and the footer read-back — and the line page behind it
   is unchanged.

2. **Given** the panel is open on a line that has no stored manufacturer price,
   **When** it renders,
   **Then** the manufacturer's price field is empty, the uplift field reads
   `30`, the entry basis is ex-GST, and the confirm action is disabled.

3. **Given** the panel is open with entry basis ex-GST,
   **When** the estimator enters a manufacturer's price of `1240` and leaves the
   uplift at `30`,
   **Then** the arithmetic rows read: their price `1,240.00`, uplift `30%`
   (`+372.00`), line price `1,612.00` — with no `$10` rounding applied at any
   step (grill D2).

4. **Given** the panel is open,
   **When** the estimator sets the entry basis to inc-GST and enters `1240`,
   **Then** the arithmetic shows the ex-GST figure `1,127.27` (1240 ÷ 1.1,
   rounded to cents) and a line price of `1,465.45` (1,127.27 × 1.30, rounded to
   cents) — i.e. the basis converts first, then the uplift applies.

5. **Given** the panel is open with values entered,
   **When** the estimator changes the uplift from `30` to `12.5`,
   **Then** the arithmetic and the footer read-back update immediately without a
   round trip, and nothing is stored.

6. **Given** the panel is open with a computed line price of `1,612.00` and the
   line's current stored total is `2,140.40`,
   **When** the footer read-back renders,
   **Then** it shows the new line price with the superseded figure struck
   through, and **nothing else** — no project total.
   *(Mock approval, owner 2026-08-31: the project total is noise here. It is
   also the ONLY place the current price appears — the panel carries no lede
   restating it.)*

7. **Given** every ops surface in this feature,
   **When** any amount is displayed,
   **Then** no figure carries a GST suffix. Ops has one presentation and no
   amount restates it; no control switches the *display* basis. The only basis
   control declares what the *typed* manufacturer's price includes (grill D6).
   *(Mock approval: "ex GST" was removed from every displayed figure.)*

### Commit

8. **Given** a valid manufacturer's price and uplift in the panel,
   **When** the estimator confirms,
   **Then** the line's total becomes the computed figure exactly (`1,612.00`,
   no rounding to $10), the manufacturer's price is stored ex-GST, the uplift
   percentage is stored on that line, and the panel closes.

9. **Given** a confirmed manufacturer price on a line,
   **When** the line page re-renders,
   **Then** the Price panel summary shows the stored line price and that it came
   from a manufacturer's price with its uplift — readable without opening the
   panel.

10. **Given** a confirmed manufacturer price on a line,
    **When** the estimator reopens the Price panel,
    **Then** the manufacturer's price field is pre-filled with the stored
    ex-GST figure, the entry basis is ex-GST, and the uplift field shows the
    stored percentage (not the 30 default).

11. **Given** a project whose quote total includes the line,
    **When** a manufacturer price is confirmed on that line,
    **Then** the quote total recomputes from the stored line totals through the
    existing single source of truth — no total is recalculated in the panel and
    persisted from the client.

12. **Given** a project in any phase,
    **When** a manufacturer price is confirmed on one of its lines,
    **Then** the project's phase is unchanged and no "waiting on manufacturer"
    or equivalent state is set (grill D7).

13. **Given** a line with a stored manufacturer price,
    **When** the estimator uses the existing `PUT /api/ops/lines/:id/price`
    typed override,
    **Then** the typed figure becomes the line total and the stored
    manufacturer price and uplift are cleared, so no stored arithmetic can
    disagree with the stored total.
    *(ASSUMED: D4 — one price fact per line, last write wins.)*

14. **Given** a line with a stored manufacturer price,
    **When** the estimator looks for a way to remove it,
    **Then** there is none: the panel offers no clear action, and the line
    cannot revert to its computed price. A stored manufacturer price is
    replaced only by another manufacturer price, or by a typed override
    (criterion 13).
    *(DECIDED: D2 — entry is one-way. Owner, 2026-08-31.)*

15. **Given** a manufacturer price is confirmed,
    **When** the change is stored,
    **Then** the acting staff account and the time of the change are recorded
    against the line.
    *(ASSUMED: attribution is recorded, matching the existing override path.)*

### Wording — mock approval, 2026-08-31

Owner rulings taken at the mock gate. Each removes something an earlier draft
carried; none adds anything.

- **No new price state and no state wording.** *"A price is a price. It is
  always based on the manufacturer's pricelist, the only difference being that
  a particular line has an ad-hoc price for that particular project."* A line
  priced this way is indistinguishable on the line page from any other.
- **No GST suffix on any figure** (criterion 7).
- **No helper prose under the fields.** The manufacturer does not necessarily
  quote on a call, and the uplift field already reads `30`.
- **No explanation of GST or of the inc→ex conversion.** The converted figure
  appears as the first arithmetic row; that is where the division is visible.
- **The current price appears exactly once**, struck through in the footer
  read-back.
- **No project total** (criterion 6).

### Validation

16. **Given** the panel is open,
    **When** the manufacturer's price field is empty, zero, negative, or
    non-numeric,
    **Then** the confirm action stays disabled and the arithmetic rows show no
    computed line price.

17. **Given** the panel is open,
    **When** the uplift field is empty, negative, or non-numeric,
    **Then** the confirm action stays disabled.

18. **Given** the panel is open,
    **When** the uplift is `0`,
    **Then** confirming is permitted and the line price equals the
    manufacturer's ex-GST price.
    *(ASSUMED: zero uplift is a legitimate entry — a pass-through at cost.)*

19. **Given** a request that bypasses the UI,
    **When** it posts a manufacturer price or uplift that is non-numeric,
    negative, or outside the accepted range,
    **Then** the API rejects it with 400 and the line is unchanged — validation
    is enforced server-side, not only in the panel.

### Abuse cases (executed for real by the tester)

20. **Given** a signed-in Customer account,
    **When** it calls the manufacturer-price endpoint for any line, including a
    line on its own project,
    **Then** the response is 403 and no manufacturer price or uplift value
    appears in any response body.

21. **Given** a signed-out Visitor,
    **When** it calls the manufacturer-price endpoint,
    **Then** the response is 401/403 and the line is unchanged.

22. **Given** a Manufacturer partner account with a valid console sign-in,
    **When** it calls the manufacturer-price endpoint (read or write) for any
    line,
    **Then** the response is 403 and nothing is stored — this surface is Staff
    only.

23. **Given** a Customer viewing their own quote (any customer-facing surface:
    quote view, PDF, emailed totals, API responses that feed them),
    **When** a line has a stored manufacturer price and uplift,
    **Then** neither figure nor the uplift percentage appears anywhere in the
    payload or the rendered document — only the final line price (grill D4).

24. **Given** staff user A acting on project P,
    **When** they post a manufacturer price for a line id that belongs to a
    different project,
    **Then** the request is rejected (404/400) and no line is modified — the
    line is resolved through its project, never by bare line id
    (`CONTEXT.md` → Line page).

25. **Given** any manufacturer-price request,
    **When** it is logged or traced,
    **Then** the manufacturer's price value does not appear in log output.

## 3. Out of scope

- **The account discount rework** (grill D5). `pricing.ts` multiplying the
  account discount into unit price stays exactly as it is; moving it to a
  totals-level row is its own feature.
- **The existing typed price override** (`PUT /api/ops/lines/:id/price`,
  migration 0046). It stays and keeps working; this is a second way to arrive at
  a figure, not a replacement.
- **`/price-preview`** — a different concern, confirmed by the owner.
- **Any customer-facing change**, including GST display behaviour on customer
  surfaces.
- **A "confirmed with the manufacturer" flag or state** (grill D3) — the stored
  figure is the whole record.
- **A global or project-level uplift setting** (grill D1) — the uplift lives on
  the line.
- **Changing `round10` / the engine's rounding convention** anywhere else
  (grill D2 scopes the no-rounding rule to this path).
- **Bulk entry** across multiple lines at once. One line, one panel.
- **Changing `OpenablePanel` or `SidePanel`** — both already do what is needed
  (grill D8).

## 4. Assumptions

Each is vetoable; the matching item in `DECISIONS.md` carries the
recommendation.

All four are now DECIDED by the owner (2026-08-31, answers in `DECISIONS.md`).
Two overruled the recommendation and are marked.

- `DECIDED: (D1)` The typed manufacturer's price is the line's price. Quantity
  is 1; the figure is stored and uplifted as-is and is never multiplied.
- `DECIDED: (D2)` **OVERRULES THE RECOMMENDATION.** Entry is **one-way**: there
  is no clear action and no revert to the computed price (criterion 14).
- `DECIDED: (D3)` **NARROWER THAN RECOMMENDED.** Entry is allowed during quote
  review, **before the quote is issued**, and refused from issue onward — the
  same mutable-state window the existing override already enforces
  (`ops.ts`: submitted, triage_pending, estimator_assigned,
  technical_review_required, customer_clarification_required). The
  recommendation had included repricing an issued quote in place.
- `DECIDED: (D4)` A line holds **one price fact**: entering a manufacturer price
  replaces any typed override, and typing an override clears the manufacturer
  price and uplift (criterion 13).
- `ASSUMED:` Zero uplift is permitted (criterion 18); negative uplift is not.
- `ASSUMED:` Rounding is to cents, twice: on the inc→ex conversion, then on the
  uplifted result (criterion 4).
- `ASSUMED:` The acting staff account and timestamp are recorded on the line
  (criterion 15).
