# 05 — UI polish: "Why this product?" price deltas

Audit and polish pass over the built result, against `docs/runs/ops2-why-price-deltas/03-ux.md`
and the approved mock `docs/mocks/ops2-why-price-deltas.html`.

## What the audit found

The build (`04-build.md`, t3) landed the *data* half of the feature correctly — one raw
delta per runner-up, `$---` for uncalculable, nothing rendered on the chosen row, no
GST/tax/basis wording — but stopped short of the approved mock's structure. t3 kept the
page's existing `Block` / `.wd__blk` / `.wd__ladder` scaffolding and appended the amount
to a new `.wd__row-bottom` flex line. The consequence on screen: the amount floated at the
end of a wrapping run of text, in the display face used elsewhere on this page for thermal
figures, with no column of its own — so a ladder of five rows produced five amounts at five
different horizontal positions, and the chosen row's *absence* of an amount read as a
rendering gap rather than as meaning.

Everything the mock specified in UX §2 (cards), §3 (two-column grid row), §6 (`deltaLabel`
for screen readers), §5 (the `ladderNote` clause that explains what the amounts are) and
§7 (the `SidePanel` tablet full-bleed fix) was unbuilt. That gap is this pass's scope.

## What changed

**Card grammar (UX §2).** Deleted `WhyDetail`'s local `Block` component and its
`.wd__blk` / `.wd__blk-h` styles; every section is now `<OpenablePanel>`, the console's
existing card. `.wd` became the page body shape it always described — a flex column of
cards on `--ds-surface-page` — instead of a grid of hand-rolled bordered boxes.
`.wd__kv` was replaced by the existing `.lp-panel__lines`, and the three section
footnotes moved from the local `.wd__reason` to the shared `.lp-panel__more`.
`.wd__card` and `.wd__lite` lost their own borders, which had been drawing a card inside
a card once their parents became real panels.

`OpenablePanel` gained an optional `className`, documented as *one appended modifier*,
not a mode flag. `panel.css` gained `.lp-panel--rows` (padding-inline: 0, with the title
and footnote re-inset) so a panel can host a full-bleed `RowList` — the same shape the
console already uses elsewhere for row lists inside cards.

**The ladder (UX §3).** The hand-rolled `<ul class="wd__ladder">` is now `<RowList>` with
`ops2-row` items, so the hairline, spacing and open-state rules come from the shipped row
vocabulary rather than from `.wd__row`'s own `border-top` (deleted, along with the
`:first-child` reset it needed). `.wd__row` is now a two-column grid:
`minmax(0,1fr) auto` — name and meta on the left, the amount alone in column 2, row 1,
`justify-self: end`, baseline-aligned with the name. Five rows produce one right-hand
column of amounts, and the chosen row's empty cell is legible as "no difference from
itself" rather than as a missing value. The chosen row carries
`.wd__row--chosen { background: var(--ds-color-brand-wash) }`; the figures and verdict
share a `.wd__row-meta` line with a `·` separator generated in CSS.

**Money face.** `.wd__row-delta` was removed from the `.lp-why__fig, .wd__fig,
.wd__row-figs` display-face group. On this page that face means *a thermal figure*; a
dollar delta borrowing it read as one more performance number. The amount is now body
face, semibold, `tabular-nums`, `--ds-text-primary`, `white-space: nowrap`.
`.wd__row-delta--absent` (the `$---` state) drops to regular weight and muted colour and
is deliberately **not** italic — it is a real value the system could not compute, not an
aside.

**Copy (UX §5) and screen readers (UX §6).** Both `ladderNote` branches now carry the
clause naming what the amounts are ("Each amount is that product's difference from the
chosen one"); without it the column is unexplained and the chosen row's blank cell is
unexplained with it. New pure `deltaLabel(delta, chosen)` in `whyCopy.ts` returns the
spoken form ("65 cheaper than the chosen product", "no price difference was recorded",
null on the chosen row), applied as `aria-label` on the amount — `-$30` otherwise reads
as "minus thirty dollars" with no referent.

**Tablet sheet (UX §7).** `SidePanel`'s `screen` form now emits `pq-sheet--screen`, and
`projects.css` styles it full-bleed (`--width/--height: 100%`, no radius, no shadow)
beside the existing `--side` rules. The `phoneForm` doc comment was corrected: an
unstyled `IonModal` is *not* full-bleed above 768px — Ionic's stock modal is a centred
inset card, which is exactly the iPad presentation the owner rejected. The form only
resolved correctly by accident on phones.

No behaviour, copy meaning, or data changed beyond the two UX-mandated copy items above.

## Files touched

| File | Δ | Why |
|---|---|---|
| `src/ops2/projects/WhyDetail.tsx` | +90/−… | `Block` → `OpenablePanel`; ladder → `RowList`; grid row; `aria-label` |
| `src/ops2/projects/whyCopy.ts` | +18/−2 | `ladderNote` clause both branches; new `deltaLabel` |
| `src/ops2/styles/line.css` | +86/−46 | row grid, amount column, money face, dead block/ladder/kv styles deleted |
| `src/ops2/styles/panel.css` | +14 | `.lp-panel--rows` |
| `src/ops2/chrome/OpenablePanel.tsx` | +8/−… | optional `className` |
| `src/ops2/chrome/SidePanel.tsx` | +12/−… | `pq-sheet--screen`; corrected doc comment |
| `src/ops2/styles/projects.css` | +22 | `ion-modal.pq-sheet--screen` full-bleed |

Screenshots: `polish-shots/why-desk-520.png`, `polish-shots/why-phone-375.png`.

## Verification

- `npx playwright test scripts/tests/web/ops2-line-why.spec.ts` — 36 passed
- `npm run test:ops2` — 94/94; `npm run test:why` — 81/81
- `npm run typecheck:gate` — clean (57 non-fatal warnings, all pre-existing)
- impeccable `detect.mjs --json` over all seven changed files — `[]`

## Two things to state plainly

**The tablet fix was not screenshotted.** The 768–1023px band has no automated coverage
and the harness available in this session could not exercise the real Ionic modal. The
`pq-sheet--screen` rules were derived by direct analogy with the shipped
`ion-modal.pq-sheet--side` block in the same file — same Ionic custom properties, same
`::part(content)` handling. It is reasoned, not observed. Worth one look on a real iPad
width before this ships.

**`line.css` grew in lines but shrank in rules.** UX §2 asserts "the stylesheet is smaller
after this feature than before it". Raw line count went 709 → 749, which looks like the
opposite. The growth is rationale-comment prose, per the house rule that comments are not
code and density should match its surroundings. Declaration blocks went **110 → 104**:
eight selectors deleted (`.wd__blk`, `.wd__blk-h`, `.wd__kv`, `.wd__kv-row`,
`.wd__ladder`, `.wd__row-bottom`, `.wd__lites`, `.wd__row:first-child`) against three
added (`.wd__row--chosen`, `.wd__row-meta`, `.wd__row-verdict::before`). The §2 claim
holds on rules; it does not hold on lines, and I did not trim comments to make it.

## Anti-patterns found and not fixed

- **`.wd__closing` sits outside the card grammar.** It is page-level closing prose, not a
  section, so it stayed a bare block with its own padding rather than becoming a panel
  with nothing in it. Correct as-is, but it is the one element on the page that does not
  belong to a card.
- **The verdict word carries meaning by colour nowhere, and by wording only.** That is the
  feature's rule (R28: nothing coloured), so it is intentional — noting it because a
  future reader will read it as a missed opportunity rather than a constraint.
