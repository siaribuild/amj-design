---
status: superseded by ADR 0005 (2026-08-18) — the framework decision only. The zone
  contract, the enforcement harness, the mobile grammar and the width-class growth ladder
  codified here all carry forward under Ionic. Two of the four grounds below were found
  stale on re-verification (corrections inline, marked ⚠); the full re-check is
  docs/design/ops2-shell-adoption-comparison.md §1.
supersedes: the component-framework position of design pass A (the mechanism-only layer
  implicit in docs/design/ops2-architecture.md §4 as first written, and the R1 interaction
  spec's narrow-width model built on it — drawer navigation over a one-column scroll)
---

# ops2 navigation: adopt the established mobile pattern grammar; own its implementation as the plane shell

## The reopening, and the corrected criterion

The earlier framing was "desktop density versus mobile nativeness", and it concluded: own
tokens plus headless primitives, adopt native patterns deliberately. That produced an R1
mock (`docs/mocks/ops2-r1-frame-and-record.html`) whose narrow-width behaviour was
multi-column layouts collapsing into one long scroll behind a hamburger drawer — no mobile
navigation model at all. The owner rejected it outright:

> "Mobile-first is the key requirement - I don't want to see anything even remotely not
> mobile-friendly. that is why, had you read the conversation, I suggested ionic (or other)
> framework - because they DRIVE established best practices on information arangement on
> mobile. How to grow the presentation into desktop - that's another challenge. But it is
> your/UX challenge to solve."

So the criterion is now **ordered, not balanced**:

1. Does it **drive** established mobile information-arrangement and navigation practice —
   stacked/plane navigation, per-view headers and footers, action placement, segmented
   controls, safe areas, keyboard insets, platform-appropriate transitions?
2. Can a dense desktop presentation be **grown** from it? This is a design problem to
   solve, never a reason to compromise the mobile half.

The point of a framework, in the owner's words, is that it *drives* practice — not that it
saves building components. Any answer that leaves mobile IA to per-region judgement has
already failed once and is disqualified on the evidence.

## The settled interaction model this decision must serve

The owner's hand-built exploratory mock (`docs/ops-redesign/mocks/ops-ux-mock.html`,
20,925 lines, 91 plane references) already encodes the mobile model he considers settled.
It is not a sketch; it is a working, rule-numbered pattern system:

- **Plane stack** below 768 px: full-screen planes pushed 240 ms / popped 200 ms
  (`--dur-push`/`--dur-pop`), slide replaced under reduced motion, every push a real
  history entry (R-148), the active plane **derived from the route, never held as module
  state** (§13.4 — held as state, deep links left the plane unreachable).
- **A visible, accessible plane switcher** (the segmented planebar, R-151); gesture is
  never the only route (R-158); long-press is forbidden (§13.8).
- **Per-plane identity**: the job plane's short-stack header (§13.5) and the line plane's
  own 48 px identity band (§13.6) — each plane names what it is about.
- **The phone action footer** (R-153, §13.5): one primary taking the width, `⋯` for every
  secondary, the blocked primary's reason rendered beneath it inside the footer;
  ConfirmStrip expands inline inside the footer, never a modal (R-153/R-1335 block).
- **Safe areas and the keyboard**: `env(safe-area-inset-bottom)` plus a `--kb-inset`
  written from `visualViewport`, carried by every sticky footer.
- **Focus discipline**: focus moves to a heading on every plane push and route change
  (R-164); a closed editor returns focus to its originating control.
- **A back control** for the stack at ≤ 1023 px (§13.3/§13.4), alongside summoned
  overlays (rail overlay, pane sheet) in the 768–1023 band.
- **Five width classes** driven by measured width, not media queries: phone < 768 (plane
  stack) · tabletp 768+ (overlay rail, sheet pane) · compact 1024+ (48 px code-strip rail)
  · desktop 1280+ · wide 1680+.

This decision's job is to make that model **mandatory and mechanically enforced** — the
recommendation supports it; nothing here replaces it. When
`docs/ops-redesign/LEARNINGS.md` lands (extraction in flight), it joins the mock as the
pattern layer's written source; conflicts resolve to the mock.

## Decision

**Adopt the established mobile navigation grammar wholesale — stack navigation, per-plane
chrome, action footers, segmented switchers, safe areas — codified from the owner's
settled mock into a single deep module, the plane shell, that owns all presentation. No
third-party mobile framework is adopted; each was costed and each fails on a named
engineering conflict, not on taste. The enforcement the last attempt lacked is structural:
regions author zones, never pages, so the rejected failure mode (a long scroll with no
navigation model) is inexpressible, and a test harness asserts the pattern grammar at
every registered destination.**

Concretely (amended into `docs/design/ops2-architecture.md` §4.0):

- `src/ops2/shell/` implements the plane shell: `PlaneStack`, `Plane` (identity band +
  body + action footer slots), `PlaneBar`, the back control, width-class resolution from
  measured width, safe-area/keyboard insets, R-164 focus moves, reduced-motion behaviour.
- **The zone contract is the seam.** A region declares each destination as an ordered set
  of **zones** with width appetites (the r1-interaction spec's work/context allocator,
  generalised) plus per-zone header and action content. The shell decides presentation:
  planes below 768, summoned overlays 768–1023, simultaneous panes at 1024+. Regions
  never render navigation chrome; the plane primitives are not exported.
- The route table's element type accepts zone declarations only — a region cannot
  register a page, so it cannot register a long scroll. Compile-time, not review-time.
- Container queries, `useContainerWidth`, the one-folding-component rule, the 320 px
  floor and the layout-purity static check all survive **as the shell's internal
  mechanisms** — design pass A's §4.1–4.3 were correct machinery at the wrong altitude,
  with no pattern layer above them.

## The options, costed

### Ionic React — the owner's named candidate, taken seriously

**What it genuinely delivers.** Ionic is the strongest embodiment of exactly the property
the owner asked for: `IonRouterOutlet`/`IonNav` make stacked navigation the default, an
`IonPage` cannot exist outside the stack, headers/footers/safe areas come with the page
scaffold, and iOS/Material variants are automatic. Had R1 been built on Ionic, the
rejected mock could not have happened — a region author physically cannot produce a
navigation-free scroll. That property is the thing worth stealing, and this ADR steals it
(the zone contract is our equivalent of "you cannot render outside an IonPage").

**Why it is still the wrong adoption, on four named conflicts:**

1. **The router pin.** `@ionic/react-router` 8.x depends on React Router **v5**; this
   repo ships React Router **7.13.0**, used by the customer site in the same bundle, and
   ops2's AC-24/25/26 (deep links surviving cold Cloudflare Access sign-in, ADR 0002)
   are designed against it. Two React Router majors in one bundle is alias-and-pray
   territory. Ionic v9 promises RR6 with "a clear path to RR7" and is on track for
   Q3 2026 — a wait-state on the critical path of D7's first region, for a dependency
   the owner's lost-day constraint cannot absorb. Driving `IonNav` by hand from RR7
   means owning the hardest part of Ionic ourselves while shipping all of its weight.
2. **Two theming systems.** ⚠ *Correction (2026-08-18): stale as written. CSS custom
   properties inherit through shadow boundaries — Ionic's entire theming API exists
   because of that platform fact — so the token layer reaches Ionic components by
   binding (~70 lines assigning token values to Ionic's documented variables), not by
   piercing. The Ionic spike demonstrably wears the ops2 palette. What remains true:
   Tailwind utilities and arbitrary selectors cannot reach shadow internals, and
   anything not exposed as a variable or `::part()` is unstylable. See the comparison
   doc §1.2. The original text follows for the record.* Ionic components are Stencil web components behind shadow
   DOM, themed through Ionic's CSS custom-property API. The approved ops2 visual
   treatment lives in Tailwind v4 tokens (`tokens.css`), and the settled mock's own
   header says its token layer was built so a component substrate "rebinds §2" — but
   shadow roots are exactly where Tailwind utilities and our tokens stop working.
   Every plane, footer and band in the settled model would be re-expressed through a
   second variable vocabulary, forever.
3. **The desktop story fails D4/C1 rather than being merely hard.** ⚠ *Correction
   (2026-08-18): partly stale. `ion-split-pane`'s `when` accepts `boolean | string`; a
   boolean driven from measured width satisfies C1's moment-to-moment rule (the spike
   drives it that way). What stands: split-pane is a two-zone construct, so the
   three-simultaneous-zone desktop with the 48px code strip remains bespoke under either
   option — a shared cost, not a differentiator. See the comparison doc §1.3. The
   original text follows for the record.* Ionic's growth
   answer is `ion-split-pane` — two zones, toggled by viewport media query. The settled
   model needs five width classes, three simultaneous zones with drag handles at
   desktop, a 48 px code-strip rail at compact, and panes that respond to **their own
   measured width** (C1: the Fold is resized mid-session beside other apps). Building
   that means bypassing Ionic layout above 1023 px — at which point ops2 is two
   presentation systems, which is I4's forbidden two-renderings drift at shell scale,
   and Ionic governs only the half we already have a settled model for.
4. **It would replace the settled model, not implement it.** Ionic drives *Ionic's*
   patterns — its transitions, its back button, its action sheets. The owner's model is
   more specific: the planebar, the blocker-reason line inside the footer, ConfirmStrip
   inline instead of modals, derive-plane-from-route, R-164 focus moves. Bending Ionic
   into that model is fighting the framework precisely where it is opinionated, which
   inverts the reason to adopt it.

**Maintenance, stated fairly:** Ionic's commercial products are discontinued; the OSS
framework continues under OutSystems with v9 in development. Not disqualifying — but a
framework this load-bearing being one strategic review away from maintenance-mode is a
real cost on "what it costs to leave later", and leaving Ionic later means rewriting the
entire presentation layer, because everything lives inside its components.

### Framework7

Its own router, incompatible with the React Router 7 deep-link model AC-24 binds; DOM-first
architecture with React as a wrapper; the desktop theme (Aurora) was removed in v8 —
mobile-only idiom by declaration. Fails harder than Ionic on every conflict above.

### Konsta UI

Tailwind-native (v5 supports Tailwind v4) and pleasant — but it is presentational
components only: **no navigation stack, no router, no plane model**. It supplies the half
we least need (styled mobile widgets, in an iOS/Material idiom that would fight the
approved ops treatment) and nothing of the half that is load-bearing (navigation
discipline). Useful as a reference implementation to quarry, not as the pattern layer.

### Headless primitives with no pattern layer — the superseded position

Right substrate, wrong altitude, and empirically failed. The seam sat at layout
*mechanisms* (container queries, a folding component); the interface regions programmed
against carried **no mobile IA behaviour**, so every region re-decided information
arrangement — and the first one to try produced the rejected mock. A pattern-free
substrate *permits* good mobile IA; the criterion demands something that *drives* it.
Superseded, not merely revised: the failure was structural, not an execution slip.

### Hybrid: a framework's navigation model with our tokens and components

This is in fact what is being decided — with the "framework" being the established mobile
grammar itself (the stack model every UINavigationController, Android task stack, and
Ionic router-outlet embodies), codified from the owner's own approved mock rather than
imported behind someone else's router and shadow DOM. The practice is adopted; the
implementation is owned. A literal third-party hybrid (Ionic's nav + our components) was
costed above and dies on conflicts 1 and 4.

## How the desktop presentation grows from this

The owner assigned this question to us; here is the concrete answer, and it is already
latent in his mock: **a plane and a pane are the same zone at different widths — growth is
revelation, not rearrangement.**

The mock's phone stack works by showing **one zone at a time**
(`.zone[data-zone="rail"][data-plane-active="true"]` — on a phone, the rail *is* the
Lines plane). The desktop layout is those same zones, simultaneously visible. So the
growth ladder is a single IA presented five ways, driven by measured width:

| Width class | Presentation of the same zones |
|---|---|
| **phone < 768** | One zone at a time: the plane stack, planebar switcher, per-plane identity bands, the action footer. |
| **tabletp 768–1023** | Primary zone holds the ground; secondary zones are **summoned** — rail as overlay (`min(88%, 420px)`, Esc/scrim dismissed), editor as sheet; the back control persists. |
| **compact 1024–1279** | Zones become simultaneous; the index rail compresses to a 48 px code strip; panes respond to their own container width. |
| **desktop 1280–1679** | All zones visible: rail 264–320, pane 380–400, canvas fluid; drag handles on fine pointers; density rises through tokens (row heights, the short-viewport ladder), not through a different layout. |
| **wide ≥ 1680** | Rail 320 · pane 440; the canvas takes the rest. |

What makes this satisfy D4's two-failure-modes test: the desktop is not a stretched phone
app because density and simultaneity are the *presentation* at wide classes (dense rows,
three zones, drag handles, keyboard affordances on fine pointers); the phone is not a
crushed desktop because narrow classes get a true navigation model (planes, footers,
identity bands), not a squeezed grid. And it satisfies C1 by construction: width classes
and zone presentation resolve from **measured width, moment to moment** — the Fold
unfolding mid-task crosses a class boundary and zones re-present without a reload,
which AC-12 already binds (no lost edit, no lost focus).

The per-zone *content* still uses design pass A's machinery — container-queried column
counts, the one folding RowList — so a pane that happens to be narrow on a desktop folds
exactly as it would on a phone. One component, one data contract, at every width.

## Enforcement — what makes this "drives", not "hopes"

1. **Compile-time:** destinations register as zone declarations; the route table's type
   refuses JSX pages. The rejected mock's shape cannot be expressed.
2. **Interface discipline:** plane primitives are internal to the shell module; regions
   cannot compose ad-hoc navigation chrome. One place implements the grammar.
3. **Playwright width matrix** (`scripts/tests/web/ops2-shell.spec.ts`, fixture shared by
   every region's spec): at 320 and 390 px, for every registered destination — exactly
   one plane visible; the scroll container is `plane-body`, never the document; the
   action footer carries the destination's primary when one exists; planebar/back
   control reachable; focus lands on the pushed plane's heading.
4. **The static purity check** (arch §4.3) stays: no `matchMedia`, no UA branches, no
   viewport media queries in ops2 layout code.
5. **The mock is normative** for the mobile grammar (with `LEARNINGS.md` as its written
   companion when it lands): the ux-designer's interaction specs cite plane rules
   (R-148, R-151, R-153, R-158, R-164, §13.3–13.9) rather than re-deriving them.

## Migration implications for what is already designed

- **`docs/design/ops2-architecture.md` §4** — amended (design pass B): gains §4.0, the
  plane shell and the zone contract. §4.1–4.3 (container queries, `useContainerWidth`,
  the folding component, 320 px floor, purity check) **survive unchanged** as the
  shell's internal mechanisms. §3.3's "rail/drawer selected by container width" is
  superseded by the shell's width-class presentations.
- **`docs/design/ops2-r1-frame-and-record.md`** — the §2.1 file list grows the plane
  primitives under `shell/`; `Shell.tsx`'s nav-frame description is superseded the same
  way. Everything else — worker seams, endpoints, `useRecord`, `Loadable`/`WriteState`,
  zero migrations — is untouched by this decision.
- **`docs/design/ops2-r1-interaction.md` and its mock** — the narrow-width model
  (overlay drawer + one-column stacked record) is superseded and returns to the
  ux-designer to be reworked on the plane shell: the record's zones (openings list ·
  line editor · context blocks) presented as planes below 768 px with the record's
  identity band, action footer and planebar per the settled model. Its §1.1 zone
  allocator (work/context appetites) **survives** — it is the zone contract's first
  instance. Its change-point tokens survive where they govern *within-zone* folding.
  The reworked mock goes back through the UX mock gate before any implementation.
- **Stack facts pinned** (verified against `feat/referral-program`): React 18.3.1 (by
  lockfile), React Router 7.13.0, Tailwind 4.1.12, Vite 6.3.5, Radix primitives and
  `vaul` already in the bundle. No new runtime dependency is added by this decision.

## Consequences

- The plane shell is R1 work and precedes the record surfaces; R1's build order gains
  "shell + zone contract" between routing and the record read plane.
- The shell is the system's deepest client-side module: every region gets mobile IA,
  desktop growth, safe areas and focus discipline for free through one small interface
  (declare zones), and a future change to the grammar lands in one place.
- Honest reversibility: if the reworked R1 mock fails the owner's judgement again, the
  zone contract is exactly the seam a framework adoption would need — zones are what
  `IonPage`s would render — so adopting Ionic later replaces the shell's implementation,
  not the regions. The cost of leaving this decision is bounded by construction; the
  cost of leaving Ionic would not have been.
- CONTEXT.md gains **Plane**, **Zone** and **Width class** as sharpened terms; "Record"
  drops its informal use of the word "plane" to keep the term unambiguous.
