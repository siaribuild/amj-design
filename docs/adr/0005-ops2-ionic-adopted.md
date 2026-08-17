---
status: accepted
supersedes: ADR 0004's framework decision (own the shell; no third-party adoption).
  ADR 0004's zone contract, enforcement harness, mobile grammar and width-class model
  all carry forward — this ADR changes who implements them, not what they are.
---

# ops2 adopts Ionic — as its navigation shell and its default component library

## Decision

**ops2 is built on Ionic React 8.x** (`@ionic/react` + `@ionic/react-router`, v9 upgrade
when released): the plane stack, chrome, and — beyond ADR 0004's shell-only framing — the
**default component vocabulary** for ops2 surfaces (lists, items, inputs, action sheets,
toolbars, segments, sheets). The owner judged the two working artifacts side by side on his
phone (`docs/mocks/ops2-r1-plane-shell.html` vs `docs/mocks/ops2-r1-ionic-spike.html`) and
ruled for adoption:

> "I genuinely prefer the experience of the ionic option on mobile - no surprises perhaps,
> given the focus of the framework to that experience."

And he explicitly released the constraint that had scoped Ionic to the shell — fidelity to
the customer site's design language:

> "I don't necessarily chase to replicate design language of the main page for ops.
> Arguably, that's a separate platform/audience, so if there's a standard library that
> could be mostly utilised - happy with that."

So the default flips: **use the library unless there is a concrete reason not to.** The
four reasons that count (the full rule a developer applies is
`docs/design/ops2-ionic-boundary.md` §1): a reuse mandate on an existing shared component
(ItemForm, Elevation, FamilyPictogram); a *behavioural* contradiction with a recovered rule
or acceptance criterion (look-alike concerns no longer count); a dense data grammar needing
light-DOM token control (the openings list, the totals panel); host coupling (zone bodies
never touch the page scaffold). Everything else is Ionic.

## What this dissolves, what it keeps

- ADR 0004's sacrifices S4 (chrome fidelity ceiling) and S5 (ARIA letter vs meaning)
  **stop being sacrifices** — fidelity to `theme.css` is no longer the goal. ops2 is
  permitted to look like Ionic. The custom 240/200 ms transition builder and the
  metric-normalisation CSS planned to make Ionic wear the mock's exact face are **cut**;
  only the ~70-line token→`--ion-*` palette/type binding remains, so ops2 is one colour
  world. S6 inverts: Ionic is now the primary vocabulary and light DOM the exception.
- The **router interim is accepted by the owner** (he chose this option knowing it):
  ops2 rides React Router 5 via `@ionic/react-router@8.8.18` while the customer site stays
  on React Router 7 — two router majors in one *repo* (never one bundle; the entries are
  separate Vite graphs). Made safe and reversible in `ops2-ionic-boundary.md` §2:
  exact pins, `overrides`, a version-aliased single v5 copy, a separate ops2 Vite config,
  and `scripts/tests/ops2-deps.test.mjs` standing guard. Not to be re-litigated; the exit
  ladder (Ionic v9/RR6 → RR7) is designed there.
- **The zone contract survives as the reversibility seam** — regions declare zones, never
  pages; zone bodies stay host-agnostic. Leaving Ionic later would replace the shell hosts
  and keep every region, exactly as ADR 0004 argued in the other direction.
- **The ≥1024 desktop layer stays bespoke** (three simultaneous zones, 48 px code strip,
  drag handles): `ion-split-pane` is a two-zone construct; this was a shared cost under
  both options and remains ours.
- The mobile grammar's *behavioural* rules still bind (route-derived planes, real history
  entries, ConfirmInline never a modal, no toast system, the four state shapes, R-164
  focus moves, R-158 gesture-never-the-only-route). Ionic implements them or hosts them;
  it does not replace them. Its *visual* defaults are now acceptable wherever they don't
  contradict a behavioural rule.

`ASSUMED:` **the dual platform idiom stays** (iOS-style on the iPhone, Material on the
Fold — Ionic's default, which is what the owner judged and preferred). Vetoable at the UX
mock gate, where the reworked mock should be shown in both modes.

## Why recorded

Hard to reverse (a component library is load-bearing everywhere), surprising without
context (ADR 0004 argued the opposite and stood for one day — the re-verification in
`docs/design/ops2-shell-adoption-comparison.md` §1 found two of its four grounds stale,
and the owner's on-device judgement decided the rest), and a real trade-off (the sacrifice
ledger, §5–6 of that document, is the record). Corrections have been folded into ADR 0004
in place so its text no longer misleads.

CONTEXT.md is unchanged: **Plane**, **Zone** and **Width class** were defined
implementation-neutrally and remain accurate with Ionic supplying the presentation.
