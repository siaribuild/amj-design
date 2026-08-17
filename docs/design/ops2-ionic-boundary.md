# ops2 on Ionic — the component boundary, the router split, and two reuse decisions

Author: architect · Date: 2026-08-18 · Status: **binding design** (ADR 0005 records the
decision; this document is what the developer implements from).

Parent: `docs/design/ops2-shell-adoption-comparison.md` §4 ("Option B, designed") — this
document supersedes that section's fidelity-driven parts and extends its boundary, because
the owner released the fidelity constraint when he ruled:

> "I don't necessarily chase to replicate design language of the main page for ops.
> Arguably, that's a separate platform/audience, so if there's a standard library that
> could be mostly utilised - happy with that."

Everything in the comparison doc's §4 not contradicted here stands (the seam table, zone
contract survival, spike-verified behaviours, §4.6 security posture). The ux-designer is
reworking the R1 mock on Ionic in parallel against the same ruling; where this document
says "ux-designer's call", the reworked mock and the mock gate decide, not the developer.

---

## 0. Affected-files index (hand-off — trust this, don't re-search)

**Docs (already edited on this branch):**
- `docs/adr/0005-ops2-ionic-adopted.md` — the decision record (new)
- `docs/adr/0004-ops2-plane-shell-owned-not-adopted.md` — superseded; two grounds corrected inline (⚠ marks)
- `docs/design/ops2-shell-adoption-comparison.md` — header now records the ruling
- `docs/design/ops2-architecture.md` §3.1 (router sentence) and §4.0 (design pass C note) — amended
- `docs/design/ops2-r1-frame-and-record.md` — owner-correction 4 added (Ionic adoption; §2.1 shell file list superseded by §5 here; schematic added to R1 scope)

**Implementation surface (developer, in the dev repo — nothing exists yet under `src/ops2/`):**
- `package.json` — deps + `overrides` + scripts (§2.1); `test:ops2` gains the deps test (§6)
- `vite.config.ts` — **unchanged** except: do *not* add `ops2.html` here (legacy `ops.html` stays)
- `vite.ops2.config.ts` — **new**, the ops2 build graph with the RR5 alias (§2.2)
- `ops2.html` — new Vite entry, input of the ops2 config only
- `scripts/tests/ops2-deps.test.mjs` — **new**, the import-boundary guard (§2.4)
- `src/ops2/` — per `ops2-r1-frame-and-record.md` §2.1, with `shell/` re-scoped to Ionic hosts (§5)
- `src/ops2/styles/theme-ionic.css` — token → `--ion-*` binding (productionise the spike's "THE BINDING" section)
- `src/ops2/styles/compat-customer-tokens.css` — the small token set reused customer components consume (§3.3)

**Reused verbatim (import in place; zero edits to these files):**
- `src/components/ItemComposer.tsx` — `ItemForm` at line 528; already renders `Elevation` (import line 25, usage line 136) so the in-form drawing (R-51) arrives free
- `src/components/quote-project/Elevation.tsx` — the schematic generator (478 lines; `SIZES` table line 55, `data-elevation` handle line 455)
- `src/components/quote-project/FamilyPictogram.tsx` — available for R6; not needed in R1
- `src/components/quote-project/OpeningDrawer.tsx:199` — the edit-panel width convention (pattern reference only, not imported)
- `src/data/catalogue.ts`, `src/data/gst.ts` — plain data modules, no router imports (verified 2026-08-18: none of the reused files import `react-router*`)

---

## 1. The component boundary

### 1.1 The rule (apply without asking)

> **Start from Ionic. A piece of ops2 UI is built light-DOM (shadcn/Radix layer, native
> elements, or bespoke) only when one of four named disqualifiers applies — and the PR
> names which one:**
>
> 1. **Reuse mandate.** The component already exists as a shared, mandated artifact —
>    `ItemForm` (register row 95), `Elevation`, `FamilyPictogram`, `gst.ts`. Import it
>    from its current home; never rebuild it in Ionic, never fork it.
> 2. **Behavioural contradiction.** The Ionic component's *behaviour* — not its look —
>    contradicts a recovered rule or acceptance criterion. Ionic's look is now
>    acceptable by ruling; only behaviour disqualifies. (The standing contradictions are
>    enumerated in §1.3's banned list.)
> 3. **Dense data grammar.** The surface's value is row/column typography under direct
>    token control across measured widths — the openings index (code · money · size ·
>    flags row grammar, the 48px code-strip compression), the totals panel, R3's
>    comparison matrices. These stay light DOM on the one-folding-`RowList` contract.
> 4. **Host coupling.** Zone bodies never use the page scaffold (`IonPage`, `IonHeader`,
>    `IonContent`, `IonFooter`) or scroll-coupled components (`IonRefresher`,
>    `IonInfiniteScroll`) directly — the scaffold belongs to the shell's hosts, because
>    the same body must render inside an `IonPage` below 1024 and inside a bespoke pane
>    at 1024+. Leaf Ionic components (`IonItem`, `IonInput`, `IonButton`, …) are fine
>    inside bodies; they render anywhere under `IonApp`.

Corollary of the ruling: the comparison doc's planned **motion builder is cut** (Ionic's
platform-native transitions are the point — "no surprises"), and the **metric
normalisation CSS shrinks to nothing mandatory**. What remains ours is the ~70-line
palette/type binding (`theme-ionic.css`) so ops2 is one colour world. If the ux-designer's
reworked mock pins any Ionic metric, it is pinned in that one file — never per-component.

### 1.2 What comes from Ionic (the concrete inventory)

**Scaffold and navigation (shell hosts — as in the spike, unchanged):** `IonApp`,
`IonReactRouter`, `IonRouterOutlet`/`IonPage` stack, `IonHeader`/`IonToolbar`/`IonTitle`,
`IonContent`, `IonFooter`, `IonButtons`/`IonBackButton` (`defaultHref` cold-start
fallback), `IonMenu` + `IonMenuButton` (the twice-lost opener becomes a component regions
cannot delete), `IonSplitPane when={measuredWidth >= 1024}`, `IonSegment` (the planebar),
`IonActionSheet` (every `⋯`), `IonModal` (the tabletp edit sheet, §4),
`setupIonicReact({ focusManagerPriority: ["heading", "content"] })` — R-164 in config.

**Content components (new scope under the ruling):**
- `IonList`/`IonItem`/`IonLabel`/`IonNote`/`IonBadge`/`IonIcon` — the Job segment's five
  push-rows (Progress/Payments/Files/History/Notes with detail arrows), the drawer's
  destinations and account block, and the Files/History/Notes/Payments block rows
  (label-over-detail at every width; they never fold columns, so `RowList` was the wrong
  tool for them all along). The **interim record list** at `/` is `IonList` too — it is
  disposable by design (R4 replaces it); spending bespoke row grammar on it buys nothing.
- Form controls on **ops2-native** forms (never inside `ItemForm`): `IonInput`,
  `IonTextarea` (note composers), `IonToggle` (the GST view toggle), `IonSelect` and
  `IonSearchbar` where the reworked mock calls for them. The interaction spec's
  native-`<select>` guidance is superseded for *new* controls; `ItemForm`'s own internals
  are its own (disqualifier 1).
- `IonSkeletonText` — the Loading state shape (R-161 wants a skeleton of the coming
  shape; this is that, and never a spinner).
- `IonButton` — footer primaries and secondary actions.
- `IonRefresher` — *available* to the ux-designer for the manual `Refresh · updated 09:14`
  idiom (no-polling rule untouched); not mandated here.

### 1.3 Ionic components that stay banned (behavioural contradictions, disqualifier 2)

| Banned | Contradicts |
|---|---|
| `IonToast` (any toast) | Writes render at the control (`WriteState`, I6/L8); there is no toast system and none is added |
| `IonAlert` / modal confirms | ConfirmInline expands from the footer, never a modal (R-39) — delete confirm and discard guard both |
| `IonLoading` / bare `IonSpinner` | The four state shapes (R-161): loading is a skeleton, never a spinner |
| `IonTabs`/`IonTabBar` as the planebar | Planebar segments are view state, not routes; a tab bar is also the forbidden second nav band (C6) |
| `IonInfiniteScroll` | Lists are bounded and paged by explicit "Show all {n}" rows (register row 151) |
| `IonModal` **with** backdrop for the edit sheet | The tabletp sheet deliberately carries no scrim so the line stays legible beside it (interaction spec §5) |
| `IonItemSliding` / swipe-to-act | Gesture is never the only route (R-158); long-press and hidden-gesture affordances are forbidden (§13.8) |

### 1.4 What stays light-DOM (disqualifiers 1 and 3)

`RowList` (openings index; the 48px code-strip form at compact), the totals panel,
`ItemForm` + its wrapper `LineEditor.tsx`, `Elevation`/`FamilyPictogram` (§3),
`ConfirmInline`, `WriteState`, the read-back strip, the Empty/Error/Gated state cards,
the ≥1024 pane grid with `react-resizable-panels` drag handles, and everything in
`src/data/`. These sit *inside* Ionic scaffolding as slotted light-DOM content — the
spike demonstrated the coexistence (an `IonToolbar` and a native `<select>` on one
screen, both reading `--ops-*` values).

---

## 2. The router plan, concretely

The facts (re-verified 2026-08-17, comparison §1.1): `@ionic/react-router@8.8.18` peers
on `react-router ^5.0.1` + `react-router-dom ^5.0.1`; the repo ships `react-router@7.13.0`
(customer site imports the `react-router` specifier only — v7 has no separate `-dom`
package in this repo). The owner accepted this interim by choosing adoption. The design
below makes it **safe** (one v5 copy, mechanically enforced boundaries) and **reversible**
(each exit step is a bounded diff).

### 2.1 `package.json`

```jsonc
"dependencies": {
  // existing, unchanged:
  "react-router": "7.13.0",                    // customer site only
  // added (pin exact — the developer records ionicons' exact version at install):
  "@ionic/react": "8.8.18",
  "@ionic/react-router": "8.8.18",
  "ionicons": "<exact 8.x at install>",
  "react-router-dom": "5.3.4",                 // ops2 + Ionic peer (v5's terminal release)
  "react-router-5": "npm:react-router@5.3.4"   // THE single v5 core copy (stable path: node_modules/react-router-5)
},
"overrides": {
  // Silence the ERESOLVE on @ionic/react-router's react-router@^5 peer (root slot is v7)
  // and pin react-router-dom's nested core to the same version. The nested copies these
  // produce are never bundled — the Vite alias (§2.2) routes every `react-router` import
  // in the ops2 graph to react-router-5, so exactly one v5 module instance exists at
  // runtime (two instances would mean two React contexts and silently broken routing).
  "@ionic/react-router": { "react-router": "5.3.4" },
  "react-router-dom":    { "react-router": "5.3.4" }
}
```

### 2.2 Two Vite configs — the entries stop sharing a graph

Today one config builds `index.html` + `ops.html` in one rollup graph. `ops2.html` gets
its **own config** (`vite.ops2.config.ts`): same plugins (react, tailwindcss), same `@`
alias and `/api` proxy, plus:

```ts
build: { rollupOptions: { input: { ops2: "ops2.html" } }, emptyOutDir: false },
resolve: {
  alias: {
    // Every bare `react-router` import in this graph — react-router-dom@5's internals
    // and @ionic/react-router's — resolves to the ONE aliased v5 copy.
    "react-router": path.resolve(__dirname, "node_modules/react-router-5"),
  },
},
```

- `npm run build` becomes `vite build && vite build -c vite.ops2.config.ts` (second pass
  writes into the same `dist/` with `emptyOutDir: false`; the Worker's asset serving and
  host routing are untouched).
- Dev: `npm run dev:ops2` runs the second config on its own port; `npm run dev`
  (customer + legacy ops) is untouched. Playwright's ops2 project points at the ops2
  server.
- The customer graph never sees Ionic or v5; the ops2 graph never sees v7. React itself
  is duplicated *across* the two graphs (one copy per page — already true in effect,
  since the pages never share a runtime).
- `ops2-r1-frame-and-record.md` §2.1's line "`ops2.html` … added to
  `build.rollupOptions.input`" is superseded by this section.

### 2.3 Version-coupled code is quarantined in the shell

- ops2 app code imports **`react-router-dom` (v5 API) and `@ionic/react` only**. No
  region file imports `react-router`.
- RR5's `history.block` (the editor discard guard's browser/OS-back interception, R-28)
  is wrapped in **one shell-owned hook — `src/ops2/shell/useBackGuard.ts`** — because the
  blocking API is the one thing RR6 removes. The RR6 migration then touches one file,
  not the editor.

### 2.4 `scripts/tests/ops2-deps.test.mjs` — the import-boundary guard

New file, node:test, **wired into `test:ops2`** alongside the frame test:
`"test:ops2": "node --test scripts/tests/ops2-frame.test.mjs scripts/tests/ops2-deps.test.mjs"`
(and thereby into `npm test`'s battery). Assertions, each its own test case:

1. **ops2 side:** no file under `src/ops2/**` contains `from "react-router"` /
   `from 'react-router'` (the v7 specifier) or `require("react-router")`.
2. **Customer side:** no file under `src/**` *outside* `src/ops2/` imports
   `react-router-dom`, `@ionic/`, or `ionicons`.
3. **Shared-component safety:** the reuse allowlist (`src/components/ItemComposer.tsx`,
   `src/components/quote-project/**`, `src/data/**`) imports no `react-router*` at all —
   these files compile into *both* graphs and must stay router-free.
4. **Manifest invariants:** `package.json` has `react-router` pinned `7.13.0` (exact),
   `react-router-dom` pinned `5.3.4` (exact), the `react-router-5` npm alias, and both
   `overrides` entries from §2.1.
5. **Lockfile invariants:** `package-lock.json` resolves root `node_modules/react-router`
   to 7.x and `node_modules/react-router-5` to 5.3.4.
6. **Config invariants:** `vite.ops2.config.ts` contains the `react-router` alias; the
   main `vite.config.ts` input does **not** list `ops2.html`.

### 2.5 The exit ladder (owned dates: none — that is accepted S1)

- **Ionic v9 ships (RR6, targeted Q3 2026):** bump `@ionic/react*`;
  `react-router-dom` 5.3.4 → 6.x; retarget the `react-router-5` alias package to
  `npm:react-router@6.x` (rename to `react-router-6` — two-line change, nothing imports
  the alias name directly); migrate ops2's five routes (Switch→Routes) and reimplement
  `useBackGuard` on RR6's affordances. One bounded pipeline feature.
- **Ionic ships RR7 support:** delete `react-router-dom`, the alias package, both
  `overrides`, and the Vite alias; ops2 imports `react-router` v7 like the customer
  site; `vite.ops2.config.ts` can merge back into the main config (or stay — separate
  graphs remain a clean property). `ops2-deps.test.mjs` flips: forbid `react-router-dom`
  everywhere, keep the Ionic-boundary and shared-component assertions.

### 2.6 Rejected alternatives (router)

- **Importer-keyed custom resolver in the single Vite config** (one dev server, one
  build): ~20 lines of resolveId logic that must behave identically in dev prebundling
  (esbuild) and build (rollup) — the exact "alias-and-pray" failure surface the split
  exists to avoid. Two configs are dumber and safer.
- **Root slot flip** (v5 at root, v7 under an npm alias): rewrites every customer-site
  router import — touches production code repo-wide for ops2's convenience. No.
- **`resolve.dedupe`:** dedupes to the root copy, which is v7. Actively wrong here.
- **Hash routing to sidestep Access-redirect coupling:** forbidden by ADR 0002; AC-24
  is router-version-agnostic anyway (Access preserves path URLs; RR5 resolves the same
  paths — comparison §4.4).

---

## 3. Reuse decision 1 — the product schematic

The owner: *"the schematic of the product (icon with dimensions) is something that
received very high feedback from users/owners"* — it **must appear in ops2**. Note for
the PM and ux-designer: the schematic appears **nowhere** in the current R1 design or
interaction spec (verified by search); this section adds it to R1 scope, and the reworked
mock must place it (the drawing plate rules below constrain where).

### 3.1 What exists and how it is shared

`src/components/quote-project/Elevation.tsx` is already a **real generator**, not a row
glyph: four sizes (`xs`/`sm`/`md`/`lg`, callers pick the size closest to intended pixels
— R-49's rule is in its own comments), true proportion, composite `parts` drawn from real
units, leaders suppressed when a dimension is unknown (`data-unsized`), `square` mode for
scan lists. Its dependency surface is `src/data/catalogue.ts` only — no router, no CSS
imports (verified). `FamilyPictogram.tsx` likewise (Sanity-authored icons, sanitised).

**Sharing mechanism: one source file, imported by both SPA entries.** The two Vite graphs
compile the same module independently — reuse means *one implementation*, not one chunk;
the pages never share runtime anyway. This is the established `ItemForm` precedent
(register row 95: imported from its current home, never forked). **The files do not move**
in this effort — a relocation to a shared directory is mechanical churn the parallel
production thread doesn't need; revisit when the dev lines merge. The deps test's
assertion 3 (§2.4) is what makes this safe: shared components stay router-free, so they
are graph-neutral by construction.

### 3.2 Where it renders in ops2, and who owns which rule

New ops2-owned wrapper: **`src/ops2/record/DrawingPlate.tsx`** — a zone-body block (light
DOM, disqualifier 1). It renders `<Elevation>` and owns the LEARNINGS rules the owner
re-cited in his ruling:

| Rule | Statement | Owner in ops2 |
|---|---|---|
| **R-17** | The drawing plate exists on the line surface | `DrawingPlate` in the line zone's body: phone line plane, and the ≥1024 line canvas |
| **R-18** | Past 24 px of scroll it pins as a 56 px strip and **never disappears**; tap or scroll-top restores `md` | `DrawingPlate`, consuming the **zone scroll signal** (§3.4) — never `IonContent` APIs directly |
| **R-50** | While unsaved edits exist the plate says whose figures it draws; the live-redraw loop exists only at ≥1280 where the editor pane is a persistent column | `DrawingPlate` caption prop (`figures: "saved" \| "yours"`), fed by the editor's dirty state from `useRecord`'s editing slice; the ≥1280-only condition is the width class, which the shell already resolves |
| **R-87** / R-51 | At ≥1280 the in-form drawing drops to `xs` (the plate is the drawing); below 1280 the plate is covered by the editor, so `ItemForm`'s own drawing serves, raised to `md` | The in-form drawing ships **inside `ItemForm`** (`ItemComposer.tsx:136`) — reuse delivers R-51 with zero work; the size adjustment is presentation, made in the `LineEditor.tsx` wrapper/CSS (`Elevation`'s own contract: "CSS beats these"), never by forking the form |

Availability, not mandate: the openings-index rows *may* carry `<Elevation size="xs"
square>` exactly as the customer's `OpeningRow.tsx:103` does — that is the ux-designer's
call in the reworked mock. `FamilyPictogram` is not needed in R1; it becomes relevant at
R6 (products region).

### 3.3 The token seam

`Elevation` draws in `currentColor` and uses exactly one external token: `var(--paper)`
(leader-text halo and break-line mask), plus two CSS hooks (`elev-dim`, `elev-break`)
styled today from `src/styles/theme.css`. ops2 does not import the customer theme, so:
**`src/ops2/styles/compat-customer-tokens.css`** defines the token set the reused
components consume — `--paper` bound to the ops2 surface token, and the `elev-break`
visibility rule (container-query form). One file, one place; when `ItemForm`'s Tailwind
classes surface further token needs during build, they land in this same file — never
scattered, never by importing `theme.css` wholesale.

### 3.4 The architectural seam this creates: the zone scroll signal

R-18 needs scroll position; zone bodies are host-agnostic (disqualifier 4) and must not
touch `IonContent`. So the **zone contract grows one member**: `useZoneScroll()` — a
context the shell's hosts provide (plane host: `IonContent scrollEvents` republished;
pane host: the pane's own `onScroll`). `DrawingPlate` is its first consumer; any future
pinned-on-scroll behaviour (R-23's rail pinning at R4+) uses the same signal. This is
recorded here because it is the one place the schematic reuse touches the shell's
interface rather than just consuming it.

---

## 4. Reuse decision 2 — the edit zone's width

The owner named the convention: `src/components/quote-project/OpeningDrawer.tsx:199` —
`fixed inset-0 md:inset-y-0 md:left-auto md:right-0 md:w-[min(88vw,520px)]` — full-screen
below 768, a capped right panel above it. *"The slideout panel from the right for edit —
it does not need to go all the way on desktop. Perhaps following the same pattern (400px
or whatever) as on the frontpage is a better idea."*

The edit zone's presentation ladder, reconciled (tokens live in `tokens.css`):

| Width class | Host | Width | Source |
|---|---|---|---|
| phone < 768 | `IonPage` in the stack (depth 2) | full screen | matches the customer's below-`md` behaviour — same convention |
| tabletp 768–1023 | `IonModal` side sheet, **no backdrop** | `--edit-sheet-w: min(88vw, 520px)` | **the frontpage pattern, verbatim** (OpeningDrawer:199) |
| compact 1024–1279 | bespoke pane (third zone) | `--pane-w-compact: 380px` | interaction spec §5 (48 + 372 + 380 = 800 verified) |
| desktop 1280–1679 | bespoke pane | `--pane-w-desktop: 400px` | **the owner's "400px or whatever" is literally this figure**; R-16: 400 gives two option columns |
| wide ≥ 1680 | bespoke pane | `--pane-w-wide: 440px` | interaction spec §5 |

No contradiction between 520 and 380–440: the tabletp sheet **overlays** (borrowed,
temporary space over the line it slides across — it can take 520 of a 768–1023 viewport);
the ≥1024 pane **shares** permanent space with rail and canvas, so it is narrower, and the
R-15 drag handle lets a fine pointer widen it toward 480 where three option columns arrive
(R-16). The `--pane-w` figures stand unchanged.

**Shell invariant (this is the concrete change the ruling forces):** the edit route
(`/record/:ref/line/:lineId/edit`) renders in the plane stack **only below 768**. From
768 up, the route keeps the *line* zone as the ground and presents the editor in the
capped right host — never as a full-width page. The spike did not exercise this (its
desktop editor still pushed full-width); the shell's zone→host mapping owns it, and §6's
Playwright assertion pins it.

---

## 5. Sequencing (what the developer builds, in order)

Steps 1–3 are plumbing and can start now; steps 4+ wait for the mock gate (the
ux-designer's reworked Ionic mock must be approved before UI implementation — hard rule).

1. **Dependency work** — §2.1 manifest, `vite.ops2.config.ts`, scripts;
   `ops2-deps.test.mjs` red → green. No app code.
2. **Token binding** — `theme-ionic.css` (productionise the spike's binding),
   `compat-customer-tokens.css` (§3.3).
3. **Shell hosts** — `IonApp`/`IonReactRouter`/`IonSplitPane`/`IonMenu`, the zone-typed
   route table (compile-time page ban carried from ADR 0004), `useZoneScroll` (§3.4),
   `useBackGuard` (§2.3), the edit-host ladder (§4).
4. **R1 screens** per the approved reworked mock — Ionic content components per §1.2;
   `RowList` index; `ItemForm` in `LineEditor`; `DrawingPlate` (§3.2).
5. **≥1024 pane layer** — unchanged from the pre-adoption design (bespoke grid,
   `react-resizable-panels`).
6. **Test battery green** — §6.

## 6. Test plan

- **`scripts/tests/ops2-deps.test.mjs`** (new; §2.4) — six assertion groups; wired into
  `test:ops2` beside `ops2-frame.test.mjs`.
- **`scripts/tests/ops2-frame.test.mjs`** (as already designed in
  `ops2-r1-frame-and-record.md` §"testing") — unchanged; its static purity check (arch
  §4.3) keeps its single `matchMedia("(pointer: coarse)")` allowlist entry; the
  split-pane boolean comes from measured width, not a media query, so no new allowance.
- **`scripts/tests/web/ops2-shell.spec.ts`** — the width-matrix grammar assertions
  (interaction spec §9) run against Ionic selectors (`.ion-page-hidden` for covered
  planes). Add: **editor-host assertion** — at 1024 and 1440 with the editor open, the
  editor container's width is ≤ 520 and the record remains visible beside it (§4).
- **`scripts/tests/web/ops2-record.spec.ts`** — add the schematic assertions:
  `[data-elevation]` present on the line surface; after 24 px+ of zone scroll the plate
  is a ~56 px strip and **still visible** (R-18's "never disappears" — assert *not*
  `display:none`, the failure LEARNINGS records at line 1178); scroll-top restores it.
- **`scripts/tests/web/ops2-edit.spec.ts`** — unchanged scope (AC-16 totals loop); runs
  against the sheet host at 768–1023 and the pane host at ≥1024.

## 7. Security

**No new sensitive surface.** Presentation-layer decision: no new endpoints, no data
classification change, RBAC/Access untouched (comparison §4.6 stands). Supply chain:
three new runtime dependencies (`@ionic/react`, `@ionic/react-router`, `ionicons`) plus
`react-router-dom@5.3.4` and the `react-router-5` alias — all pinned exact; the
`overrides` block prevents silent router drift; in this configuration Ionic makes no
runtime network requests (icons bundled — proven by the single-file spike) and carries no
telemetry. `FamilyPictogram`'s SVG sanitiser is reused as-is (its allow-list posture is
unchanged by where it renders).

## 8. Rejected alternatives (beyond §2.6)

- **Pure Ionic for the data surfaces too** — rejected before the ruling and still:
  register row 95 mandates `ItemForm` verbatim (Ionic form components would fork it), and
  the openings-row grammar needs light-DOM token control (disqualifier 3). The ruling
  relaxed *fidelity*, not the reuse mandates.
- **Keeping the full normalisation CSS to make Ionic wear the settled mock's metrics** —
  the ruling's point is that this fidelity is no longer wanted; the ux-designer's
  reworked mock defines the face, and only what it pins gets pinned (in one file).
- **Moving `Elevation`/`FamilyPictogram`/`ItemForm` to a shared `src/shared/` home now**
  — mechanical churn across a production surface another thread is actively working;
  import-in-place with the deps test's router-free assertion buys the same safety today.

---

## Decisions needed

**None.** The one owner-adjacent point is recorded as `ASSUMED:` in ADR 0005 — the dual
platform idiom (iOS-style on the iPhone, Material on the Fold) stays at Ionic's default,
which is what the owner judged on his phone; the mock gate shows both faces and is the
veto point.
