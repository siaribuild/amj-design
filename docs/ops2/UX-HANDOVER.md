# ops2 — UX handover

**For:** the next agent producing UX for the OpenFrame ops console.
**Written:** 2026-08-21. **Branch:** `design/ops2-planning`. **Worktree:** `E:\Projects\amj-ops-planning`.

Read §1–§4 before designing anything. §5 is the list of things that have already
been got wrong, some of them more than once; it will save you a rejection.

---

## 1. What this is, and who it is for

A ground-up rebuild of the staff operations console. The existing one was
assembled to be functional and never designed; it is explicitly a throwaway,
**replaced then deleted** — there is no parallel-running period, so ops2 must be
complete before the switch.

**The users are two founders.** Both have unrestricted access; between them they
do every operational task. Design for one person switching contexts fast, not for
handoffs between desks.

**The governing constraint, in the owner's words:**

> "Responsiveness is everything, speed is money. We can't afford waiting the whole
> day to open the request in the evening — that's the day lost as we would be able
> to follow-up with questions and contacting manufacturer only the next day."

The cost of a delayed glance is a working day, because both the customer
follow-up and the manufacturer call then slip past the point where either can
happen. This is why **mobile-first is not a preference**.

**The console is operated while on the phone to a customer.** Editing is the
normal outcome of opening a line, not the exception. It is used one-handed,
between other tasks, on a phone or a Fold held open beside other apps.

### The four review jobs a line surface must serve

Not mutually exclusive; a reviewer may do any or all on one line.

1. **Validate opening dimensions** — source is a plan document or something the
   customer said on the phone. `quote_line.origin` is literally `manual | schedule`.
2. **Validate the product recommendation** — the reviewer needs the model's inputs
   and its output. **Design to the owner's stated model** — *"the cheapest product
   that matches size and energy constraints"* — **not** to the code, which
   actually filters then ranks on six weights with price at 15%. He is reconciling
   that himself; see `OPEN-DEFECTS.md` R1. Do not put the correction on screen.
3. **Adjust the product and/or options** — splits when an opening is too large,
   the closest match when nothing meets the energy requirement, family consistency
   as a judgement call, addons. This ends in the full configurator.
4. **Adjust the price against the manufacturer's confirmation** — their figure,
   plus an uplift defaulting to 30% and adjustable in place, plus GST if stored
   with GST. Assume line prices go into the quote as-is with a single discount at
   the items-total level; that platform change is being made separately.

---

## 2. Where everything is

| File | What it is |
|---|---|
| `docs/ops-redesign/GRILL-CONCLUSIONS.md` | **Binding.** 19 decisions, 8 constraints, actors in the owner's own words. |
| `docs/ops2/OPEN-DEFECTS.md` | Open defects, rulings, and what is parked. **Read every time.** |
| `docs/specs/ops2.md` | The spec and its acceptance criteria. |
| `docs/ops2/interaction-spec-r1.md` | The living interaction spec. Sections marked superseded are exactly that. |
| `docs/ops-redesign/LEARNINGS.md` | Recovered pattern system from a **lost** design session. The only surviving record; departures must be argued in writing. |
| `docs/ops2/register.md` | Carry-across register, 291 rows. What exists today and must not silently disappear. |
| `docs/adr/0005-*` | Ionic adopted as shell **and** default component library. |
| `docs/adr/0006-*` | Shared core, two skins, with the admission rule. |
| `docs/design/ops2-ionic-boundary.md` | When you may leave Ionic. Four disqualifiers. |
| `docs/design/ops2-line-surface-reuse.md` | What the customer quote builder already does and what can be reused. |
| `docs/mocks/ops2-r1-ionic.html` | The mock. Single self-contained file. |
| `docs/mocks/ops2-r1-ionic-src/` | Its source. `npm install && npm run build`, then copy `dist/index.html` over the mock. |

**Never touch `E:\Projects\amj-website-design`.** Another thread works there. Read
customer-side files with `git show feat/referral-program:<path>`; never
`git checkout`, `switch` or `stash` in that directory.

---

## 3. Settled — do not reopen

- **Ionic** is the navigation shell and the default component library. Start from
  Ionic; go bespoke only on one of the boundary document's four disqualifiers, and
  say which in the PR.
- **Ionic's own theme.** Colour is parked — *"UX is more important than colours at
  this point."* Do not chase the customer site's design language; ops is a
  separate platform for a separate audience.
- **The record list view is APPROVED and closed.** *"what's important is on the
  screen, secondary items are in another tab, in another panels."*
- **Read-only first** on a line, leading to full edit. The list cannot carry
  enough to decide what to change.
- **prev/current/next** for line-to-line movement: **top placement and the concept
  are settled.** Only executions have been rejected. Do not propose a bottom
  scroller or a `< 4/18 >` counter; both are closed. Do not spend a full band of
  chrome on it.
- **Back names its destination**, and from a line the destination is the record —
  never `Projects`.
- **No accordions or disclosure-in-place for information groups.** The owner's
  reasoning, which matters more than the rule: *"they are a cheat code for putting
  a lot of information into a single screen without thinking."* Removing the lids
  while keeping everything on one screen does not answer it.
- **Destinations must never require horizontal scrolling; content may.** A fixed
  set that must all be reachable cannot hide members off-screen. Eighteen openings
  are material being worked through, not destinations.
- **No undo, no change history.** *"we consult them and make product decisions."*
- **Line notes are not a thread and not editable.** The field is
  `quote_line.room_label` — the customer's own note, 500 chars, typed under "Note
  (optional)". Show their words, read-only. Threads are project-level only.
- **Quantity is removed from the view entirely.** Retired product-wide.
- **No family-mix surfacing.** The list view gives that sense.
- **The human is the authority.** No screen may block, gate, or demand
  justification for a human decision. Warnings must be visible without
  obstructing. This kills confirmation dialogs and disabled-until-justified
  controls as design tools.

### The rule that replaced no-scroll

Arrival used to have to fit without scrolling, and that constraint is what forced
real decisions about what belongs. It has been given up deliberately (splits
cannot fit). Its load now sits on one enforced rule:

> **A panel is a summary that leads somewhere. It never grows to fit its content.**

`Panel` takes a budget, **slices to it**, and demands an overflow string. A panel
cannot silently absorb one more fact, because the fact would not render. If you
add a panel, give it a budget and state it in the spec. This is the only brake
left.

---

## 4. Under judgement right now

The bottom edge is contested: the tab bar and the primary action both want it.
Variants are switchable in the mock (labelled switcher, vertically centred).

- **A** bar everywhere, CTA in a bottom panel above it · **D** scroll-away ·
  **E** CTA in the header · **F** docked FAB · **G** no persistent CTA ·
  **H** one bar carrying both · **OFF**.
- **E is recommended** and is the one the owner explored independently. Its rule:
  **the header's trailing slot is the primary-action slot in every mode** —
  the state-changing action when viewing, `Cancel`/`Save` when editing, and the
  `⋯` disappears in edit mode because a bounded task has no secondary actions.
  His stated rationale is **maximum separation**: put the verb at the opposite end
  from the destinations so a verb and a place are never confused.
- Within E, three header treatments: **labelled back**, **bare chevron**, **path
  in title**. Bare is the only one that answers both *where am I* and *where does
  back go* at 320. The line plane is not fixed by any of them — its constraint is
  the two button clusters, not the back label.

**Tabs** are `Dashboard · Projects · Enquiries · More`, mobile and tablet only;
desktop keeps the left rail. `IonTabs` came off the banned list for this and only
this — the ban on tabs *within* a record stands. Two known consequences: the top
hamburger is redundant and has been removed, and `IonTabs` computes the selected
tab from the matched route, so record routes must nest inside the tab's route or
the bar lights nothing.

---

## 5. Things already got wrong — some more than once

**The pattern:** every repeated failure has been **scaffolding or an edge case,
never the main design.** The main design gets re-derived every pass because it is
what everyone is arguing about; these do not, so a rewrite restores whatever the
file last happened to say. Four instances so far:

1. A mock control covering the very thing being judged — the variant switcher over
   the header, three times, plus the same defect a generation earlier in
   `LEARNINGS.md` §3 (a dev strip covering the rate-card primary and "Save new
   rates"). **The switcher stays vertically centred. Grow it downward.**
2. A spec claiming the title never truncates while its CSS ellipsised it, on the
   same commit.
3. File controls rendered with `href="#"` and no handler, while the report said
   the behaviour was carried.
4. Navigation removed at narrow width along with the thing that opened it —
   recorded in `LEARNINGS.md` and then repeated.

**The mechanism behind #1, which is structural:** the mock builds from a
scratchpad and the result is copied into the source folder. That is one-way, so a
fix committed *in* the folder is invisible to the next build unless pulled back
first. **Before rewriting a file, run `git log --oneline -3 -- <path>` and read any
commit you did not author.** When rewriting a block whose comment states a
*reason*, carry the reason forward.

### The reporting standard (spec §31.5)

**Say what you exercised and what you inferred.** Two reports have been relayed to
the owner as verified and were not: a mechanism measured in its two states but
never actually triggered, and a claim contradicted by the file it described. If
rAF or compositing stops you driving something in this environment, name it — the
owner then knows to check it on a device. An honest "measured the states, could
not drive the trigger" is worth more than a clean table.

**Report the thinking before the screen.** It has worked every time it was done:
what is the reviewer doing in the first two seconds, what must be visible on
arrival, what is the primary action, what earns a second step and why, what should
not be here at all.

### Ionic behaviours found the hard way

| Behaviour | Consequence |
|---|---|
| `ion-content` scrolls in shadow DOM; scroll events retarget to the host | `e.target.scrollTop` is always 0. Use `scrollEvents` + `onIonScroll`, or `composedPath()[0]`. |
| `IonButton` strips `aria-describedby` and `aria-label` from the host | A blocked primary cannot carry its reason to a screen reader. Put the reason in a real adjacent control. |
| `ion-back-button` ignores `text=""` and ignores `text` changing after hydration | Hide via `part="text"`; key it to force a remount. |
| `ion-tab-bar` carries `contain: strict` | Cannot be transformed or resized from outside. Unmount it instead of animating it. |
| `ion-split-pane` finds its content among **direct** children | Wrapping the outlet in `IonTabs` breaks the desktop layout silently. |
| `--ion-color-step-*` and `--ion-text-color-rgb` are not defined in this stylesheet set | Quiet roles rendered full-strength black — contrast passed, hierarchy gone. Use `color-mix` over a pair that always resolves. |
| `React.StrictMode` | Do not use it. Stencil caches ancestor refs in `connectedCallback` and the double mount leaves them pointing at the discarded first mount. |
| `ion-modal.present()` never resolves in a hidden tab | rAF-driven; assert state rather than presented geometry. |

### Unverified — needs a real device

The scroll-away trigger under a finger; whether `More` opens the drawer; whether
F's FAB overlaps anything painful; H's tab semantics; whether the blocked reason
is announced; whether a 40px title is acceptable in the hand; whether a bare
chevron feels unambiguous four levels deep.

---

## 6. How the owner works

- He judges **artefacts, not descriptions**: *"I won't know before I see it."*
  When a trade cannot be settled on paper, build both and make them switchable.
- He answers fast and decisively, and expects the same. Do not open decisions he
  has already closed.
- He will tell you when something is wrong in blunt terms. The correct response is
  to find the cause, not to defend the work.
- **He is right more often than the code is.** Two of his instincts turned out to
  be already written down as rules in `CONTEXT.md` before anyone checked.
- Where he is wrong on a fact, say so with the file and line — he takes it.
- Deliver in-conversation, and to `D:\OneDrive\ops2-mock\` while he is mobile.

---

## 7. Open decisions that are his, not yours

Listed in full with reasoning in `OPEN-DEFECTS.md`. Currently outstanding:

1. Which tab variant, and which header treatment.
2. Whether confirming delivery gates issuing a quote.
3. Whether `waitingOn` generalises rather than growing a flag per counterparty.
4. Whether a delivery override belongs in the divergence record.
5. The line note's name — four exist in the codebase; `Line note` is recommended.
6. Whether the accordion ruling reaches inside reused `ItemForm` disclosures.
7. Whether `feat/ops-ux-gap-pass` on `apertly` is live or abandoned — six unmerged
   commits of ops mobile fixes this effort independently rediscovered, which
   affects what the register describes as today's baseline.

Do not resolve these by designing past them. Put them up, and record the answer
where the next person will find it.
