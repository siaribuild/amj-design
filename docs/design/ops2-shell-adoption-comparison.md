# ops2 — the adoption option, designed and costed against the bespoke plane shell

Author: architect · Date: 2026-08-17 · Status: **decided — the owner ruled for Option B
(adopt Ionic) on 2026-08-18**, judging the two artifacts on his phone: *"I genuinely
prefer the experience of the ionic option on mobile."* He also released the fidelity
constraint (*"I don't necessarily chase to replicate design language of the main page for
ops"*), which widens §4's boundary beyond the shell — ADR 0005 records the decision and
`docs/design/ops2-ionic-boundary.md` is now the binding design (D-A → B; D-B → dual idiom
kept, ASSUMED, vetoable at the mock gate; D-C → interim accepted). This document remains
the costing record. Original status line: comparison for the owner's call — not a
decision; ADR 0004 stood until the owner ruled. It was the strongest case
for adoption, built as instructed: adopt as much as possible, then state honestly what
it costs. The owner's challenge names Ionic, Capacitor and "shadcn + typescript" — the
three sit at different layers, so §2 maps the layers before anything is ranked.

Companion artifact: **`docs/mocks/ops2-r1-ionic-spike.html`** — a working single-file
build of the R1 record, line and editor screens on the adoption stack, wearing the ops2
palette, to be opened on a phone beside `docs/mocks/ops2-r1-plane-shell.html`.

## 0. Why this exists

ADR 0004 rejected Ionic partly on the ground that "the established mobile grammar
already exists in the owner's own settled mock, in more specific form than Ionic
ships." The owner pointed out this is circular — the mock is his Ionic brief
hand-implemented, not independent evidence that a framework is unnecessary. **That
plank is withdrawn.** The remaining planks were four verifiable claims; §1 re-verifies
each against the world as of 2026-08-17 rather than inheriting them. One is stale, one
was overstated, two stand.

---

## 1. ADR 0004's four claims, re-verified

**1.1 "The router pin: `@ionic/react-router` requires React Router v5." — CONFIRMED,
current.** Checked against the npm registry today: `@ionic/react-router@8.8.18`
(`latest`; nightlies through 2026-08-14, so actively developed) peers on
`react-router ^5.0.1` + `react-router-dom ^5.0.1`. A `dev`-tagged build peers on
`react-router >=6.4.0 <7` — RR6 support is in active development for Ionic v9, which
the maintainers have on track for **Q3 2026** (imminent but unreleased). React Router
**v7** — this repo's version (`react-router` 7.13.0) — is an open, untriaged feature
request (ionic-framework #30745, Oct 2025) with "a clear path to RR7" as roadmap
language and no commitment, PR or date.

*One qualification the ADR overstated:* it said "two React Router majors in one
bundle." Ops is a **separate Vite entry** (`/ops.html`, host-routed), so the split is
two majors in one *repo*, not one bundle — manageable with npm `overrides` and an
import-boundary test rather than alias-and-pray. Real cost, smaller than stated
(designed in §4.4).

**1.2 "Shadow DOM makes Ionic unreachable by the Tailwind token layer." — STALE as
written.** CSS custom properties inherit through shadow boundaries — Ionic's entire
theming API (global `--ion-*`, per-component variables, `::part()`) exists because of
that platform fact. The ops2 token layer reaches Ionic components by **binding, not
piercing**: a ~70-line mapping file assigns token values to Ionic's documented
variables. The spike does exactly this (`theme.css`, "THE BINDING") and the artifact
demonstrably wears the ops2 palette, type ramp and dark chrome. What remains true:
Tailwind *utilities* and arbitrary selectors cannot reach shadow internals, and
anything Ionic does not expose as a variable or part is unstylable. Under the
combination design (§4) that residue is confined to the chrome — sacrifice S4.

**1.3 "`ion-split-pane` is media-query driven and cannot satisfy D4/C1." — PARTLY
STALE.** Its `when` property accepts `boolean | string`; a boolean driven from
measured width satisfies C1's moment-to-moment rule (the spike drives it that way,
and the rail appears at 1024 without a media query). What stands: split-pane is a
two-zone construct. The three-simultaneous-zone desktop with the 48px code strip and
drag handles is not expressible in it — the ≥1024 presentation is bespoke under
either option (S2), and it was assigned to us either way.

**1.4 "Konsta has no navigation stack; Framework7 dropped its desktop theme." —
CONFIRMED, current.** Konsta UI 5.3.0 (Tailwind v4) is presentational only; its own
docs position it for use *with* a parent framework (Ionic or Framework7) supplying
routing and navigation. Framework7 removed the Aurora desktop theme in v8 to focus
exclusively on mobile; v9.1.2 is current, still with its own router, incompatible
with the URL-derived plane rule (LEARNINGS §1.3) that AC-24/25/26 bind.

**Net:** the engineering case against adoption is narrower than ADR 0004 stated. It
is one hard conflict (the router, a wait-state on a half-committed roadmap), one
shared cost (desktop is ours regardless), and a fidelity ceiling now bounded to the
chrome — not four walls.

---

## 2. The candidate field, mapped by layer

The owner's three names are not alternatives; they answer different questions.

| Layer | Question it answers | Candidates |
|---|---|---|
| **Native runtime** | How does the app reach the device? | Capacitor |
| **Navigation / chrome** | What drives the plane stack, transitions, back semantics, drawers, sheets? | Ionic — the only maintained occupant (see §2.4) |
| **Primitives** | What are rows, fields, selects, badges made of? | shadcn/Radix — **already the repo's incumbent** |

### 2.1 Capacitor — out of scope, with the reason on the record

Capacitor is packaging and device APIs, not UI. It becomes relevant only if ops2 ships
as a store-distributed native app — and D14 settles installability as a
**home-screen PWA with no App Store**. The one capability that could have changed the
calculus is push notifications (deferred, grill §6): iOS has supported web push for
installed home-screen web apps since iOS 16.4 (2023), so the deferred push feature is
achievable without Capacitor. What Capacitor would buy — native keyboard control
(sharper than the web's `visualViewport`), store distribution, deeper device APIs —
all arrives with Xcode/Play Console build chains, signing, and store review: exactly
the overhead D14 declined. **Dismissed; revisit only if push-on-iOS proves inadequate
as a PWA in practice.**

### 2.2 shadcn/ui — not a candidate; the incumbent

Verified against `feat/referral-program`: **`src/app/components/ui/` is a full
canonical shadcn installation** (accordion through tooltip), running on the Radix
suite, Tailwind 4.1.12, cva and tailwind-merge already in `package.json`. "shadcn +
typescript" is therefore not something ops2 could adopt — it is what the repo already
is at the primitives layer, and both shell options build their data surfaces on it
(directly, or on token-styled equivalents like the interaction spec's native
`<select>`).

**shadcn *alone* is disqualified on the evidence, and this must be said plainly:** it
has no navigation model whatsoever. A shell assembled from shadcn primitives with
hand-rolled navigation *is* design pass A — the superseded position — and the first
attempt on that substrate produced exactly the rejected mock: good-looking components
in a long scroll. ADR 0004's §"headless primitives with no pattern layer" stands
unrevised on this point.

Its copy-in model deserves the precise answer, because it cuts into the owner's
maintenance argument: **copy-in means no *styling* dependency — but not no
dependency.** shadcn's markup is pasted and owned; its *behaviour* (focus traps,
popovers, scroll locks, typeahead) lives in the Radix runtime packages, which keep
updating and fixing browser drift like any dependency. And none of that layer touches
the burden the owner is actually worried about — OS navigation behaviour (transitions,
history, gestures, keyboard insets, safe areas) — because primitives do not navigate.
The maintenance question is decided entirely at the navigation layer (§5).

### 2.3 Ionic — the only candidate that owns the shell

Maximal adoption means the navigation *discipline* comes from the dependency: an
`IonPage` cannot exist outside the router outlet's stack, so the rejected failure
mode is inexpressible by construction — the property ADR 0004's zone contract
re-implements by hand. **Ionic React 8.x** (v9 upgrade when released) with
`@ionic/react-router` on RR5 until Ionic's RR6/RR7 lands.

### 2.4 "Something else" — the survey, honestly

- **React Aria Components** (Adobe) and **Base UI**: headless behaviour libraries at
  the same altitude as Radix. Adopting either duplicates the incumbent primitives
  vocabulary and supplies no navigation. No case.
- **Onsen UI**: a mobile UI framework with navigation — effectively dormant (no
  meaningful releases in years). Fails the maintenance argument on its face.
- **React Navigation / React Native Web / Expo**: the navigation discipline is
  strong, but it arrives with a platform move (RN component model, its own router
  replacing React Router entirely). Out of proportion for one console in a web repo.
- **Vaul** (already in the bundle): a quality sheet/drawer primitive — useful for the
  tabletp editor sheet under the bespoke option; not a shell.

**Honest conclusion:** the market for URL-driven, stack-based mobile navigation on
React DOM has exactly one maintained occupant. Every other name is either a
primitives layer or a platform migration. The real choice is binary: Ionic's shell,
or ours.

---

## 3. The two real options

Because the primitives layer is incumbent and Capacitor is out of scope, the field
reduces to:

- **Option A — own the shell** (ADR 0004 as designed): bespoke plane shell +
  shadcn/Radix-layer data surfaces + bespoke ≥1024 panes.
- **Option B — adopt the shell** (this document's design): Ionic chrome/navigation +
  the same shadcn/Radix-layer data surfaces + the same bespoke ≥1024 panes.

A third shape — **pure Ionic**, using its lists and form components for content too —
is named and rejected: register row 95 mandates `ItemForm` reused verbatim (Ionic
form components would fork it); the data-dense row grammar keeps its exact treatment
only on light DOM; and it maximises the shadow-DOM fidelity ceiling for no gain. The
combination strictly dominates it for this console.

**The two options share everything below the shell**: the zone contract, the route
table's compile-time page ban, `RowList`, the state shapes, `WriteState`, `gst.ts`,
the tokens file, the interaction spec's screens and copy, the Playwright width
matrix, and the entire ≥1024 pane layer. The decision moves less than half of R1's
shell work — but it moves the half that carries the OS-coupled maintenance.

---

## 4. Option B, designed

### 4.1 The seam — who owns what

| Layer | Owner | Contents |
|---|---|---|
| Navigation & chrome | **Ionic, as-is** | `IonRouterOutlet` stack (URL-driven, real history entries, pages stay mounted beneath — scroll/state survive by construction), iOS edge-swipe-back, `IonPage`/`IonHeader`/`IonContent`/`IonFooter` plane anatomy, `IonMenu` drawer (overlay, scrim, Esc, focus containment — the twice-lost opener becomes a component regions cannot delete), `IonSplitPane when={boolean}` rail, `IonSegment` planebar, `IonActionSheet` overflow, `IonModal` sheet (`showBackdrop={false}` for §13.3), `IonBackButton` with `defaultHref` cold-start fallback, focus-on-heading via `setupIonicReact({ focusManagerPriority: ["heading","content"] })` — **R-164 in one config line, verified in the spike** — and covered-page `aria-hidden` management |
| Configuration | **Ours, small, spiked** | The token→`--ion-*` binding (~70 lines); mode normalisation (~40 lines: bar heights pinned to `--ident-h`/`--planebar-h`, md shadows off, borders from `--rule`); the plane transition as a custom `AnimationBuilder` (~40 lines: push 240ms / pop 200ms, `cubic-bezier(.2,0,0,1)`, cross-fade under reduced motion — the settled motion, not Ionic's default); `swipeBackEnabled`; bundled data-URL icons (no runtime fetches — proven by the single-file build) |
| Data surfaces | **shadcn/Radix layer + spec'd native controls, unchanged from Option A** | The row grammar, identity-band content (short stack; line band + stepper), footer grammar (primary + `⋯` + reason line), ConfirmInline expanding inside the footer (R-39 — delete confirm and discard guard, never a modal), the read-back strip (R-159), totals with delivery honesty, `ItemForm` verbatim, native `<select>` per interaction spec §3.6 |
| ≥1024 presentation | **Bespoke, identical to Option A** | Three simultaneous zones, 48px code strip, drag handles (`react-resizable-panels`, already in the bundle), container-width folding |

**Theming coexistence — the direct answer to the double-theming allegation:** the
data surfaces never enter a shadow boundary, so the token layer styles them directly
(Tailwind utilities or plain CSS — identical mechanics either way); only the chrome
is themed through Ionic's variable API, and that entire second vocabulary is one
~70-line binding file consuming the same tokens. Two consumers, one source of
values. The spike demonstrates both halves at once: an `IonToolbar` and a native
`<select>` on the same screen, both wearing `--ops-*`-derived values.

### 4.2 The zone contract survives as the seam between hosts

Regions still author zones, never pages — the compile-time ban stands. The shell maps
zones to hosts: **< 1024**, a zone renders inside an `IonPage` in the stack (Ionic
presents); **≥ 1024**, the same zone renders inside a pane in the bespoke grid (we
present). The rule that makes this safe: **zone bodies must be host-agnostic** — no
`IonContent`-specific APIs inside them (S3). The spike's 1280px screenshot shows
precisely where Ionic stops: the rail goes persistent, and the record beside it is
still a one-column page until the pane layer exists.

### 4.3 What Ionic delivers against the recovered rules

Verified in the spike (headless Chrome, 390×844, touch): document never scrolls
(R-12: 0/0 overflow); a line push is a real history entry and OS back pops the stack
(R-148, LEARNINGS §1.3); the stepper `history.replace`s through the filtered pool —
history depth unchanged (R-155 + spec §10.3); focus lands on the pushed plane's `h1`
(R-164, via config); the menu control is 48×48 (R-178); the blocker row filters the
index (R-19); the read-back strip moves with an option change and shows struck
previous values (R-159/AC-16); the delete confirm and discard guard expand inside
the footer (R-39); zero console errors; nothing exceeds the frame.

### 4.4 The router split (the one genuinely ugly part)

- `package.json` gains `@ionic/react`, `@ionic/react-router`, `ionicons`, plus
  `react-router-dom@5` (nesting its own `react-router@5`); top-level
  `react-router@7` stays for the customer site. npm `overrides` pins the nesting.
- The two Vite entries never share router chunks: ops2 imports only
  `react-router-dom` (v5 API); the customer site only `react-router` (v7 API).
  **Enforced by a new test** — `scripts/tests/ops2-deps.test.mjs`, wired as
  `test:ops2` in `package.json`: greps `src/ops2/**` for `from "react-router"`
  (forbidden) and non-ops2 `src/**` for `from "react-router-dom"` (forbidden), and
  asserts the lockfile nesting.
- AC-24/25/26 (deep links through cold Cloudflare Access sign-in) are
  router-version agnostic — Access preserves the URL; RR5 resolves the same paths.
  RR5's `history.block` is how the editor's discard guard intercepts browser/OS
  back (supported; left un-wired in the spike).
- **When Ionic v9 ships RR6:** ops2 migrates RR5→RR6 (mechanical; the route table is
  five routes). When Ionic ships RR7 support, the split ends. Neither date is ours —
  that is sacrifice S1.

### 4.5 Sequencing

1. Dependency work: packages, `overrides`, `ops2-deps.test.mjs` red→green.
2. Binding + normalisation CSS + transition builder (productionise the spike files).
3. Shell assembly: `IonApp`/router/`IonSplitPane`/`IonMenu` + the zone-typed route
   table.
4. R1 screens per the interaction spec; content components unchanged from Option A.
5. The ≥1024 pane layer (identical work to Option A).
6. Playwright width matrix — `scripts/tests/web/ops2-shell.spec.ts`'s §9 assertions
   are DOM-behaviour statements and run against either implementation; only
   selectors differ (`.ion-page-hidden` instead of a bespoke attribute).

### 4.6 Security

**No new sensitive surface.** Presentation-layer only: no new endpoints, no data
classification change, RBAC/auth/Cloudflare Access untouched. Supply-chain note:
three new runtime dependencies (`@ionic/react`, `@ionic/react-router`, `ionicons`)
pinned to exact versions; in this configuration Ionic makes no runtime network
requests (icons bundled as data URLs — verified in the single-file build) and
carries no telemetry. The `overrides` pin prevents silent router-version drift.

---

## 5. The maintenance ledger — who absorbs which burden

The crux of the owner's argument, answered per burden rather than in general. "Us"
means: we find breakage ourselves (usually on the founders' phones, in lost-day
currency) and we fix it.

| Moving target | Option A (own) | Option B (adopt) |
|---|---|---|
| Stack/transition correctness, interruption (back mid-animation) | **Us** (~hand-built, plus its test matrix) | **Ionic** |
| History ↔ stack coherence (bfcache, popstate timing, browser drift) | **Us** | **Ionic** |
| iOS edge-swipe-back in-app gesture | **Us** — realistically never hand-built; browser-level history swipe only | **Ionic** (ships it; verified pattern) |
| Covered-plane `aria-hidden`/inert, focus movement on push | **Us** | **Ionic** (one config line) |
| Per-plane scroll/state preservation | **Us** (build it) | **Ionic** (pages stay mounted — by construction) |
| Platform look/behaviour evolution (new iOS/Android conventions) | Not tracked — the mock has its own face | **Ionic** tracks upstream, community early warning |
| Safe-area `env()` insets | Shared: standard CSS in both | Shared |
| **Keyboard inset over footers (web/PWA `visualViewport`)** | **Us** | **Us** — Ionic's strongest keyboard handling assumes Capacitor, which D14 rules out. Owned under both options; do not count it twice |
| Primitive behaviour drift (popovers, focus traps, scroll locks) | **Radix runtime** (updates) in both options — shadcn's copy-in owns styling, not behaviour | Same |
| Dependency events (majors, breaking upgrades, router migrations) | None | **Us**: Ionic majors ~yearly + RR5→RR6→RR7 (×2) on Ionic's timetable |

**Reading it honestly:** Option A's exposure is ~300–500 lines of OS-coupled shell
code and an expected few browser-release-driven breakages a year, hours-to-a-day
each, *self-discovered*. Option B trades that for upgrade cadence and the router
wait-state. The copy-in layer (shadcn) is orthogonal: it absorbs nothing on this
list under either option, and its zero-runtime property — real as far as it goes —
applies only to styling, which was never the burden in question.

---

## 6. The sacrifice list

For the owner to judge. "Wait" resolves on someone else's timetable; "permanent" is
the shape of the choice.

### Choosing Option B (adopt) gives up:

- **S1 — Router self-determination.** *Wait, uncommitted.* ops2 runs React Router 5
  while the customer site runs 7: two router APIs in one repo, an `overrides` block,
  an import-boundary test standing guard. Ionic v9 (RR6) targets Q3 2026 — this
  quarter — but is unreleased; RR7 is roadmap language with no date. Until then
  ops2's router capabilities are on Ionic's schedule, and RR5→RR6→RR7 is two
  migrations we would not otherwise do. **How bad:** no user-visible cost; a real,
  recurring developer tax and a genuine schedule dependency on OutSystems.
- **S2 — Adoption covers less than half the shell.** *Permanent.* Ionic governs
  <1024. The three-zone desktop, code strip, drag handles, container folding — the
  parts D4/C1 make hard — are bespoke under both options. **How bad:** neutral in
  the comparison, but it caps the maintenance relief at the phone half.
- **S3 — A discipline tax on zone content.** *Permanent, enforceable.* Zone bodies
  must stay host-agnostic or the desktop pane host breaks. One rule, checkable in
  review and by the deps-test pattern. **How bad:** small, but it is I4's
  two-renderings drift standing permanently at the door.
- **S4 — A visual fidelity ceiling, on the chrome only.** *Permanent, mostly paid.*
  Under the combination the data surfaces keep the exact treatment (light DOM,
  tokens direct). The residue is chrome internals not exposed as variables/parts:
  segment indicator geometry, action-sheet row metrics, toolbar internals — and the
  mock's bordered segmented planebar becomes Ionic's indicator style. **How bad:**
  judge on the artifact; that is what the side-by-side phone test is for.
- **S5 — Exact ARIA grammar, on the chrome only.** *Permanent, partial.* The mock
  specifies `role="tablist"` planebar semantics and one console-wide live region;
  `IonSegment` ships its own semantics and Ionic pages announce their own way.
  Equivalent meaning, different letter; patching attributes onto shadow hosts is
  fighting the framework. **How bad:** small for two founders; it becomes the
  console's accessibility character.
- **S6 — Two component vocabularies in ops2.** *Permanent.* Chrome is Ionic;
  content is shadcn/Radix/native. One console, two component idioms in the code —
  a style-guide discipline (the seam in §4.1 is the rule). **How bad:** small and
  containable; listed because it is permanent.
- **S7 — Bundle weight.** *Permanent.* ~300 KB gzip added to the ops entry
  (measured: the whole spike inlined is 306 KB gzip). Customer site untouched.
  **How bad:** trivial for two users on late-model phones on an installed app.
- **S8 — Roadmap dependence.** *Permanent.* Ionic's commercial products are being
  discontinued; the OSS framework continues under OutSystems with daily nightlies
  and v9 in active development — but single-steward maintenance-mode later is a live
  possibility. Exit cost is bounded by the zone seam (§7). **How bad:** real,
  capped, and symmetric with Option A's own failure mode.

### Choosing Option A (own) gives up:

- **B1 — Someone else maintaining the phone-half moving targets.** *Permanent.* The
  first seven rows of §5's ledger become ours: built once (~300–500 OS-coupled
  lines plus their tests), then maintained against browser and OS drift forever,
  with breakage self-discovered rather than reported upstream first. **How bad:**
  a few incidents a year at hours-to-a-day each is the estimate; the substantive
  cost is *who finds them* — the founders, mid-consultation, in the lost-day
  currency the grill established as the governing constraint.
- **B2 — Conformance by construction.** *Permanent, mitigated.* Bespoke
  re-implements what `IonPage` enforces mechanically; the zone contract's
  compile-time ban restores the property, but we maintain the enforcement as well
  as the behaviour.
- **B3 — The in-app back-swipe gesture.** *Permanent in practice.* Hand-building
  iOS-quality edge-swipe-back is not proportionate; Option A phones rely on the
  browser/OS history gesture alone. Consistent with R-158 (gesture is never the
  only route), so a loss of polish, not capability.

---

## 7. Straight comparison

| Axis | Option A — own (ADR 0004) | Option B — adopt (Ionic shell + incumbent primitives) |
|---|---|---|
| **Initial build, R1 shell** | ~9–13 dev-days: screens plus hand-built stack/transition/interruption/focus/history machinery and its test matrix | ~4–6 dev-days: binding + normalisation + transition (~150 lines, already spiked) + router-split plumbing + screens; the machinery arrives built |
| **Initial build, ≥1024** | Identical — bespoke pane layer both ways | Identical |
| **Ongoing maintenance** | Own ~300–500 OS-coupled lines; a few self-discovered browser-release fixes/year; zero dependency events | Ionic majors ~yearly; RR5→RR6→RR7 ×2 on Ionic's timetable; phone-half OS drift absorbed upstream with community early warning |
| **Device/OS longevity** | Depends on the founders noticing and us fixing | Strong below 1024 (Ionic tracks OS releases); n/a above — bespoke there anyway |
| **Older/different devices** | Verified only on devices we test; C2 ("late-model only") makes this low-weight today | Broad device matrix maintained upstream; matters if C2 ever loosens (a hire's mid-range Android) |
| **OF requirements fit** | 100% by construction — the requirements were reverse-engineered from the artefact the owner approved | ~90–95%: every load-bearing behaviour verified in the spike; residue = S4/S5 chrome ceiling, planebar look |
| **Reversibility** | Zones are the seam: adopting Ionic later = zones become `IonPage` children; regions untouched | Same seam, symmetric: leaving Ionic = rewrite the shell hosts, keep every region — plus unwinding the router split (a simplification) |
| **The failure mode each risks** | A Safari release breaks keyboard/gesture/history behaviour on a Tuesday; a founder loses part of a day before we ship the fix | Ionic goes maintenance-mode mid-life; ops2 rides a frozen framework until a host rewrite |

**The two costs that should decide it** (everything else roughly nets out): the
**router wait-state** (B) against **self-discovered OS breakage** (A). The first is a
developer tax with a probable end date someone else controls; the second is a
recurring operational risk that lands on the founders directly, in exactly the
lost-day currency that governs this project.

## 8. Spike report

Built outside both repos (scratchpad, throwaway), pinned to today's real versions:
`@ionic/react` 8.8.18, `@ionic/react-router` 8.8.18, `react-router` 5.3.4, React
18.3.1, Vite 6. Single self-contained build (1.36 MB / 306 KB gzip, zero runtime
fetches) committed as **`docs/mocks/ops2-r1-ionic-spike.html`**.

**It demonstrates the combination, not one half:** Ionic owns only the shell (stack,
transitions, menu/split-pane, segment, action sheet, back button, focus config);
every data surface — the row grammar, identity bands, footer grammar, ConfirmInline,
read-back strip, totals, and the editor's fields (native `<input>`/`<select>` per
interaction spec §3.6) — is light-DOM content styled directly by the ops2 tokens,
exactly as the shadcn/Radix layer would be. The double-theming boundary is visible in
one file: the binding section of its stylesheet is the entire second vocabulary.

Screens: the record (identity short stack, lifecycle row, tappable blocker filter,
Lines·18/Job planebar, 18-line index with the full row grammar, totals with delivery
honesty, blocked `Issue quote` + reason + `⋯` sheet), the line plane (48px band,
stepper over the filtered pool, facts, flags, notes, delete → ConfirmInline in the
footer), the editor (height-first dims, non-blocking undersize warning, live
read-back with struck previous values, inline discard guard), job-block pushes, the
dark-chrome drawer (`Role · founder`, `Sign out`), and the split-pane rail at ≥1024
driven by a measured-width boolean.

Verified headless (Chrome, 390×844 touch): document never scrolls; line push = real
history entry; OS back pops the stack; stepper replaces (history depth unchanged);
focus lands on the pushed plane's `h1`; menu control 48×48; zero console errors;
nothing exceeds the frame.

**What only the owner's phones can prove:** iOS swipe-back feel in Safari and in the
installed app; keyboard-inset behaviour over the editor footer on both platforms;
whether Ionic's ios/md dual idiom reads as one product or two in hand. That is the
on-device checklist to run beside the bespoke mock.

**Spike verdict:** adoption is viable. Nothing load-bearing failed; the router split
is the only structural cost the spike could not exercise (it has no RR7 neighbour),
and §4.4 designs it rather than waving at it.

## 9. What survives the decision either way

The zone contract, the compile-time page ban, `RowList`, the state shapes,
`WriteState`, `gst.ts`, the tokens file, the interaction spec's screens and copy,
the Playwright width matrix, and the whole ≥1024 layer. CONTEXT.md's **Plane / Zone
/ Width class** vocabulary is implementation-neutral and needs no edit for either
outcome. If the owner chooses adoption: ADR 0005 records it and ADR 0004 is marked
superseded-in-part; §1's corrections should be folded into ADR 0004 whichever way he
rules, since two of its stated grounds are no longer accurate.

---

## Decisions needed

**D-A. Which shell does ops2 R1 build on?** Judge the two artifacts side by side on
your phone — `ops2-r1-plane-shell.html` (own) against `ops2-r1-ionic-spike.html`
(adopt).

- **Option A — own** (ADR 0004): exact conformance to the settled mock, zero
  dependency events; we own the phone-half OS drift and its breakages are
  self-discovered (B1), in lost-day currency.
- **Option B — adopt** (this design): Ionic shell + the repo's incumbent primitives.
  You accept S1 (router wait-state: RR5 in ops2 now, two APIs in the repo until
  Ionic reaches RR7), S4/S5 (chrome fidelity/ARIA ceiling — judge on the artifact)
  and S8 (OutSystems roadmap dependence); you gain the §5 ledger's first seven rows
  maintained upstream and roughly a week less initial shell work.

  *My recommendation, held loosely: the gap is far narrower than ADR 0004 stated,
  and the honest fulcrum is S1. If the router wait-state is acceptable to you,
  Option B's maintenance case (B1) is the stronger position for a two-person team
  whose constraint is the lost day. If it is not, Option A remains fully defensible,
  and §9's shared seam keeps the door open to adopt at Ionic v9 with regions
  untouched. A reasonable middle: rule for B in principle but gate the dependency
  work on v9's actual release (targeted this quarter), building R1's content — which
  is identical under both — meanwhile.*

**D-B. If Option B: one idiom or two?** Ionic renders iOS-style on your iPhone and
Material-style on the Fold (transitions, control feel). Accept the dual idiom
(platform-native per founder — Ionic's default and its pitch), or pin one mode for a
single product face (one founder gets non-native transition style)? The spike runs
the default. Recommendation: keep the dual idiom; the normalisation CSS already
keeps the shared face (type, bars, colour) identical.

**D-C. If Option B: accept the interim router state explicitly?** RR5 in ops2 today
→ RR6 at Ionic v9 → RR7 when Ionic ships it. This is S1's concrete form and should
be accepted eyes-open. If it is unacceptable on its face, that decides D-A for
Option A (or for the gated-on-v9 middle path above).
