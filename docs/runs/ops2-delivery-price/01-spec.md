# 01 — Spec: delivery price and delivery address in ops2

**Grill:** conducted with the owner 2026-09-01. Conclusions in `00-ask.md`
(D1–D18) are binding and are not re-opened here. Where this spec appears to
disagree with a D-decision, the D-decision wins.

**Sizing:** one feature, one pipeline run. Two UI surfaces, one endpoint widened,
one additive migration, one shared-component constraint removed.

---

## 1. Problem, and the actor it serves

**Actor: Staff** (`CONTEXT.md` §Actors) — an OpenFrame ops-console operator,
today one of the two owners.

In their terms:

> "I am in ops2 working a project up to issue. The thing that actually blocks
> issuing is the delivery figure, and it is the one number I cannot set here — I
> have to open the legacy console to type it, then come back. And when the
> customer's destination is wrong or half-filled, I cannot fix that in either
> console. I want to settle the figure that is holding this quote, and correct
> where the job is going, without leaving the screen I am working on."

The mechanics behind that: `project.delivery_amount` NULL **is** the issue gate
(`worker/lib/issue.ts`), and NULL means no human has said a number. ops2 renders
delivery as static text. The destination is written once by the customer's
submit form and is editable by nobody.

Two facts, two places (D1):

- **The price** is settled from the record's totals card (D17).
- **The destination** is corrected on the Project tab (D6, D10).

No surface does both.

**Secondary actor: Customer.** Not a user of this feature, but the beneficiary
and the risk: the delivery figure typed here is the one they are charged, and
the address typed here is where their job is delivered. They see neither panel.

---

## 2. Acceptance criteria

Given–When–Then, numbered, each independently verifiable. "Staff" means an
authenticated staff session; "editable" means the project is at `draft` /
`ISSUABLE_FROM`; "locked" means past it.

### A — Data

1. **Given** the `project` table before this feature, **When** the new migration
   is applied, **Then** `project` has nullable `delivery_line1`,
   `delivery_line2`, `delivery_state`, added by `ADD COLUMN` only, with no table
   rebuild in the migration file.
2. **Given** existing projects with rows in child tables, **When** the migration
   is applied to a copy of production data, **Then** every pre-existing
   `project`, `order_line` and `payment` row still exists afterwards and the new
   columns read NULL.
3. **Given** a project created by the customer submit form after this feature,
   **When** it is read back, **Then** `delivery_suburb` and `delivery_postcode`
   hold what the form captured and `delivery_line1`, `delivery_line2`,
   `delivery_state` are NULL (the form is unchanged — §3).

### B — API: `PUT /api/ops/projects/:id/delivery`

4. **Given** Staff and an editable project, **When** they PUT
   `{ amount: 250 }`, **Then** 200, `delivery_amount` is 250,
   `delivery_settle_json` is stamped with the machine's answer at that instant,
   and an audit event records both numbers and the actor — exactly as before this
   feature.
5. **Given** Staff and an editable project, **When** they PUT
   `{ line1, line2, suburb, state, postcode }` with no `amount` key, **Then**
   200, the five destination columns hold the submitted values,
   `delivery_amount` and `delivery_settle_json` are **unchanged**, and an audit
   event records the address change.
6. **Given** Staff and an editable project whose zone resolved from postcode
   `3121`, **When** they PUT a body changing `postcode` to `3000`, **Then** the
   zone re-resolves from the new postcode alone and `delivery_state` is not read
   by `resolveZone` on any path.
7. **Given** Staff and an editable project, **When** they PUT
   `{ suburb: "" }` or `{ postcode: "" }` or `{ line1: "" }`, **Then** 400 and no
   column changes (D14 — the destination is never blanked).
8. **Given** Staff and an editable project, **When** they PUT `{ suburb }` of 81
   characters, **Then** 400; **and** a suburb of `"  Richmond  "` is stored
   trimmed as `"Richmond"` (D15).
9. **Given** Staff and an editable project, **When** they PUT a `postcode` that
   is not exactly four digits, **Then** 400 and no column changes.
10. **Given** Staff and an editable project, **When** they PUT
    `{ state: "QLD" }`, **Then** 200; **When** they PUT `{ state: "Queensland" }`
    or any value outside the eight AU state/territory codes, **Then** 400.
11. **Given** Staff and an editable project, **When** they PUT
    `{ amount: -1 }` or `{ amount: "250" }` or `{ amount: 1e12 }`, **Then** 400
    and `delivery_amount` is unchanged.
12. **Given** Staff and an editable project, **When** they PUT `{ amount: 0 }`,
    **Then** 200 and `delivery_amount` is `0` — a settled decision, not "unset"
    (`CONTEXT.md` §Settled delivery: never a truthiness check).
13. **Given** Staff and an editable project, **When** they PUT
    `{ amount: null }`, **Then** 200 and `delivery_amount` becomes NULL — the
    endpoint keeps its un-settle capability for the legacy console (D16).
14. **Given** Staff and a **locked** project, **When** they PUT any body —
    amount, address, or both — **Then** 409 and nothing changes.
15. **Given** Staff, **When** they PUT an unknown project id, **Then** 404 and
    the response body reveals nothing about whether that id exists elsewhere.

### C — Totals card as the door (record page, editable project)

16. **Given** Staff on a record for an editable project, **When** the record
    renders, **Then** the totals card shows `Lines`, `Delivery`, `Project total`
    in that order with a single chevron vertically centred against the **card**,
    and no chevron, button, hover wash, focus ring or `aria-label` on any
    individual row (D17).
17. **Given** that card, **When** Staff press anywhere on it (mouse) or focus it
    and press Enter or Space (keyboard), **Then** the delivery price slide-out
    opens.
18. **Given** that card, **When** a screen reader reads its control, **Then** the
    accessible name states what pressing it does — it opens the delivery price —
    sourced from the surface's copy module, and the card renders **no** `<h2>`
    heading (D18).
19. **Given** a record whose project has `delivery_amount` NULL, **When** the
    totals card renders, **Then** the `Delivery` row reads `Not set` and
    `Project total` is presented without a delivery contribution — no error
    styling, no warning, no explanation line (D8: unpriced is the ordinary
    state).
20. **Given** a record for an editable project, **When** the page renders,
    **Then** nothing is drawn below the totals card, and no separate "Delivery"
    card exists anywhere on the record (D9).

### D — Delivery price slide-out

21. **Given** the price slide-out is open, **When** it renders, **Then** it is a
    right-hand `SidePanel` with `phoneForm="side"` at every viewport width (D2),
    containing exactly one editable field labelled `Delivery price` plus save and
    dismiss controls.
22. **Given** the price slide-out is open, **When** its full text content is
    inspected in any state — label, placeholder, hint, caption, error, empty —
    **Then** it contains no occurrence of "GST", "tax", "inc", "ex",
    "inclusive" or "exclusive", and no basis switch (D11).
23. **Given** a project with `delivery_amount` = 250, **When** the price
    slide-out opens, **Then** exactly one delivery figure is on screen: the
    settled 250. No machine estimate, no comparison, no delta, no percentage
    (D12).
24. **Given** a project whose zone basis is `unpriced_table`, **When** the price
    slide-out opens, **Then** the field is an empty input the staffer types into
    — no error state, no "unavailable" message, no disabled control (D8).
25. **Given** the price slide-out, **When** Staff enumerate every control in it —
    buttons, keyboard paths, an emptied-and-submitted field — **Then** none of
    them produces a request with `amount: null`, and no "clear" or "un-settle"
    control exists (D4 / D16).
26. **Given** the price slide-out open with `250` typed, **When** Staff save,
    **Then** the request is sent, the panel closes, and the totals card's
    `Delivery` row and `Project total` show the new figure without a page
    reload.
27. **Given** the price slide-out open, **When** Staff type a negative number or
    non-numeric text and attempt to save, **Then** the save is refused with an
    inline message and no request is sent.
28. **Given** the price slide-out open with an edit typed, **When** Staff
    dismiss without saving, **Then** nothing is persisted and the totals card
    still shows the previous figure.
29. **Given** the price slide-out open, **When** the save request fails (network
    or 5xx), **Then** the panel stays open, the typed value is preserved, and an
    inline failure message is shown — the edit is never silently lost.

### E — Delivery address panel (Project tab)

30. **Given** Staff on the Project tab of an editable project, **When** the tab
    renders, **Then** it shows a `Delivery address` `OpenablePanel` card with a
    visible title, a card-level chevron, and the project's stored destination
    displayed as read-only text.
31. **Given** a project with only `delivery_suburb` and `delivery_postcode` set,
    **When** the Project tab renders, **Then** the card shows the suburb and
    postcode and treats the missing `line1`/`line2`/`state` as ordinary — no
    error, no warning, no "incomplete" badge (D10 scope boundary).
32. **Given** the address card, **When** Staff press it, **Then** a right-hand
    `SidePanel phoneForm="side"` opens with five fields — `Address line 1`,
    `Address line 2`, `Suburb`, `State`, `Postcode` — pre-filled from the
    project's stored destination only.
33. **Given** the address slide-out on a project whose account holder has a
    complete account address, **When** the fields render, **Then** none of them
    is pre-filled from, or shows as placeholder, any part of the account address
    (`CONTEXT.md` §Account address).
34. **Given** the address slide-out, **When** Staff change suburb and postcode
    and save, **Then** the request carries the address fields only, the panel
    closes, the card shows the new destination, and the project's
    `delivery_amount` is unchanged and still displayed unchanged on the record's
    totals card (D12 — the settled figure does not move when the destination
    does, and no delta is shown anywhere).
35. **Given** the address slide-out, **When** Staff clear `Suburb` or `Postcode`
    or `Address line 1` (where it holds a value) and attempt to save, **Then**
    the save is refused inline and no request is sent (D14).
36. **Given** the address slide-out, **When** its full text content is inspected
    in any state, **Then** it contains no tax word of any kind (D11), and no
    delivery price field, note field or zone control (D1 / D3 / D5).
37. **Given** the address slide-out open with edits typed, **When** Staff
    dismiss, **Then** nothing is persisted; **and When** a save fails, the panel
    stays open with the typed values preserved and an inline failure message.

### F — Locked projects (D13)

38. **Given** Staff on a record for a **locked** project, **When** the totals
    card renders, **Then** it shows the figures only: no chevron, no tab stop,
    not reachable by keyboard, not pressable, and **no** line explaining why.
39. **Given** Staff on the Project tab of a **locked** project, **When** the
    address card renders, **Then** it shows the destination only: no chevron, no
    tab stop, not pressable, and no reason line.

### G — `OpenablePanel` (shared ops2 chrome, D18)

40. **Given** the existing Price and Why panel call sites, **When**
    `OpenablePanel`'s `title` becomes optional, **Then** their rendered output is
    unchanged and their existing browser assertions pass untouched.
41. **Given** `OpenablePanel` rendered without `title`, **When** the DOM is
    inspected, **Then** there is no `<h2>` and no `aria-label` on the
    `<section>`, while the door button still carries
    `aria-label={open.label}`.
42. **Given** the `OpenablePanel` change, **When** the diff is reviewed, **Then**
    it adds no render-prop, slot map, `variant`, `mode` or `header` object, and
    the file is no longer than before.

### H — Abuse cases (executed for real by the tester)

The endpoint writes money that will be charged to a customer and an address a
delivery is sent to. Every criterion below is a forbidden action that must fail.

43. **Given** an authenticated **Customer** account, **When** they PUT
    `/api/ops/projects/:id/delivery` for **their own** project, **Then** 403, no
    column changes, and no delivery data in the response body.
44. **Given** an authenticated **Customer** account, **When** they PUT that
    endpoint for **another account's** project, **Then** 403 (never 404-vs-403
    disclosure differences that reveal the project exists) and no column
    changes.
45. **Given** an authenticated **Manufacturer partner** account, **When** they
    PUT or GET any delivery surface on any project, **Then** 403 and no customer
    delivery data is returned.
46. **Given** **no session** (or an expired one), **When** the endpoint is
    called, **Then** 401/403 with no data, and nothing is written.
47. **Given** a Staff session, **When** they PUT with a body containing
    `project_id`, `account_id`, `user_id` or `phase` alongside the delivery
    fields, **Then** those keys are ignored — the target project comes from the
    URL and the actor from the session, never from the body.
48. **Given** any caller, **When** they PUT `suburb` or `line1` containing a
    script payload (`<script>alert(1)</script>`), **Then** it is either rejected
    or stored and rendered as inert text in ops2 and on any document — never
    executed.
49. **Given** any delivery write, **When** the worker's logs and the audit event
    are inspected, **Then** they contain no bank/payout data and no customer
    personal data beyond the delivery destination itself and the actor id.

---

## 3. Out of scope

- **Zone rate entry.** The fifteen zones and their NULL rates stay in the legacy
  console's Pricing → Delivery zones (D8).
- **The delivery note.** The column stays; nothing in ops2 writes or reads it
  (D5).
- **An un-settle control in ops2.** The API keeps the capability for the legacy
  console; ops2 renders no path to it (D4, D16).
- **The issue gate itself.** `worker/lib/issue.ts` is untouched.
- **The legacy console.** No change, and it must keep working against this
  endpoint unmodified.
- **The customer submission form.** It still captures suburb and postcode only;
  widening it to a full address is a separate phase on the customer site (D10
  scope boundary).
- **Backend lean-out.** No opportunistic removal of endpoint capability or DTO
  fields during this feature (owner, 2026-09-01).
- **Progress, payments and files on the Project tab.** They inherit the pattern
  this panel establishes (D6); they are not built here.
- **Delivery on any customer-facing surface.** No change to how the customer
  sees delivery, including GST presentation (customer surfaces keep respecting
  the account's GST mode — that rule is untouched; D11 governs the ops console
  only).

---

## 4. Assumptions — each vetoable

- **ASSUMED:** `amount` becomes **optional** on the endpoint, and the three
  cases are distinct: key absent = leave `delivery_amount` alone (address-only
  save), `amount: null` = un-settle (legacy console only), a number = settle.
  Needed because the address panel must save without touching the price.
- **ASSUMED:** the price slide-out shows the amount field and nothing else — no
  zone, no m², no destination echo. Rationale: D3 plus D12. If Staff want to see
  where the job is going while pricing it, that is a read-only destination line
  and a one-line change.
- **ASSUMED:** `delivery_state` is one of the eight AU codes
  (`NSW VIC QLD SA WA TAS NT ACT`) chosen from a native `<select>`, not free
  text. Suburb stays free text per D15.
- **ASSUMED:** `postcode` is exactly four digits; no gazetteer cross-check
  against suburb or state (consistent with D15).
- **ASSUMED:** D14 ("never blanked") binds `line1`, `suburb`, `state` and
  `postcode` — a field holding a value cannot be saved empty — but **not**
  `line2`, which is a genuinely optional address line and may be cleared. A
  field that is already empty simply stays empty.
- **ASSUMED:** field limits — `line1` and `line2` trimmed, 1–120 characters when
  present; `suburb` trimmed 1–80 (D15).
- **ASSUMED:** the address write emits an audit event of the same kind the price
  write already does, recording actor, timestamp and the changed fields.
- **ASSUMED:** copy — the `Delivery` row reads `Not set` when
  `delivery_amount` is NULL; the price field is labelled `Delivery price`; the
  address card is titled `Delivery address`. No other wording is introduced.
- **ASSUMED:** `CONTEXT.md`'s **Openable panel** entry is updated by the
  architect to make the heading a caller's choice (D18). The **Delivery
  destination** and **Settled delivery** entries already describe this feature's
  end state and need no change.
