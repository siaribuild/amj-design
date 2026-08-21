---
status: accepted
supersedes: the theme clause of ADR `0005-ops2-ionic-adopted.md` (ops2 ships Ionic's
  default theme outright) and §1.5 of `docs/design/ops2-ionic-boundary.md`. Everything
  else in both — the adoption itself, the component boundary, the router split, the three
  functional requirements — carries forward untouched.
---

# FrameFlow themes ops2, over Ionic's components

Date: 2026-08-22
Deciders: the owner (ruling); developer (recording)

## Context

Two decisions arrived four days apart and the second one moves the first.

**ADR 0005 (2026-08-18)** adopted Ionic React 8 as ops2's navigation shell and default
component vocabulary, after the owner judged two working mocks on his phone. In a second
ruling the same day he also withdrew the token→`--ion-*` binding that ADR had planned:
*"happy to reuse standard components/themes, if such are available."* ops2 was to ship
**Ionic's default theme outright**, the fidelity ledger closed, and `docs/design/ops2-ionic-boundary.md`
§1.5 recorded that no file under `src/ops2/` may restate a palette — only three
*functional* overrides were permitted.

**The owner has since ruled that FrameFlow themes ops2.** `docs/design/frameflow.md` — an
earthy sage/bone/warm-charcoal system with its own type, motion, shadow and radius scales
— is the design language ops2 wears. He also capped corner radii at `--theme-radius-sm`
(5px), which diverges from FrameFlow's own prose (8–16px) and from its own recipes.

Both rulings are his and the later one governs. This ADR records the supersession where
**this** branch can carry it, since ADR 0005 lives on `design/ops2-planning` and is not
ours to edit.

## Decision

1. **FrameFlow is ops2's theme.** Its raw scales live in `src/ops2/theme/`, its semantic
   tokens in `src/ops2/styles/tokens.css`, and `src/ops2/theme/ionic.css` binds Ionic's
   variables to them — `--ion-color-*` (with the `-rgb` triples Ionic composes
   translucency from), `--ion-background-color`, `--ion-text-color`, `--ion-card-*`,
   `--ion-font-family`.
2. **The binding runs one way.** Ionic's variables read FrameFlow's; nothing reads an
   Ionic value back. A palette change lands everywhere; an Ionic upgrade cannot silently
   move a brand colour.
3. **Corner radii are capped at 5px**, enforced at one token — `--ds-radius-surface` in
   `src/ops2/styles/tokens.css` — which every recipe and every Ionic component override
   reads. Ionic ships radii *per platform mode* (an `ion-card` is 4px on Material, 8px on
   iOS), so the cap is applied to the element rather than left to the mode: on the iPhone
   the owner actually uses, Ionic's default would have broken it while every Material
   screenshot looked compliant. `scripts/tests/web/ops2.spec.ts` measures what is
   rendered, in both modes.
4. **Ionic remains the component vocabulary**, exactly as ADR 0005 decided. This changes
   what those components look like, not which components are used.

## What this does NOT overturn

- **ops2 is still not chasing the customer site's design language.** The owner said twice
  that ops is a separate platform for a separate audience, and that stands: FrameFlow is
  its own system, not `src/styles/theme.css` carried across. §1.5's rule against restating
  *the customer palette* is honoured, not broken — what it forbade was fidelity to the
  main site, and there is none here.
- **The three functional requirements survive on any theme** (§1.5): fact-carrying text
  stays ≥ 4.5:1 with blocked controls inert rather than faded; `warning` and `danger`
  carry the product's hard distinction and are never collapsed; every money figure carries
  its GST basis legibly. FrameFlow's ramps are bound to Ionic's `warning` and `danger`
  separately for precisely that reason. None of the three has a surface to bind to yet —
  the scaffold renders one card — and each becomes testable when the screen that needs it
  is built.
- **The component boundary, the router split, and the banned list** are untouched.

## Consequences

- The `~70-line token binding` ADR 0005 withdrew is back, at roughly that size, in one
  file. It was withdrawn as *fidelity to the customer site*; it returns as *ops2's own
  theme*, which is a different thing wearing the same mechanism.
- Ionic's `--ion-color-step-*` ramp is **not** bound yet. Nothing in the scaffold uses it;
  the navigation step should generate it from FrameFlow's neutrals rather than leave
  Ionic's grey steps under a warm palette.
- FrameFlow has one hero hue, so Ionic's `secondary` and `tertiary` are derived (sage-700,
  info-500) rather than designed. A surface that genuinely needs a second brand colour is
  a question for the ui-designer.
- Every Ionic component added later needs its corner brought under the cap in
  `src/ops2/theme/ionic.css`. Ionic has no global radius variable — checked; it does not
  exist — so the browser test is the backstop for forgetting.

## Where the ops2 documents live, and the ADR number collision

**Every ops2 planning artefact is on the `design/ops2-planning` branch, not here.** Read
one with `git show design/ops2-planning:<path>`:

| Document | What it governs |
|---|---|
| `docs/specs/ops2.md` | The spec. §9 (same host, no new hostname), §12 (the three rollout states) |
| `docs/adr/0002-ops2-path-routing-not-hash.md` | Path routing, the Worker SPA fallback, base detected at boot |
| `docs/adr/0005-ops2-ionic-adopted.md` | Ionic adoption; the router interim |
| `docs/design/ops2-ionic-boundary.md` | The component boundary (§1), the router plan (§2), the deps guard (§2.4) |

**The ADR numbers collide across the two branches, and the collision is real.** This
branch and `main` carry `0001-submission-gate-identity-from-session.md` and
`0002-trade-status-derived-from-application-ledger.md`; `design/ops2-planning` carries a
different `0001` (RBAC role store) and a different `0002` (ops2 path routing), plus 0003
to 0006. So a citation of "ADR 0002" resolves to *trade account status* on this branch and
to *ops2 routing* on that one — a citation that looks checked and is wrong.

Until the planning thread renumbers (its call, not ours), **code in this branch cites ops2
ADRs by full filename and names the branch.** The number alone is not a citation.
