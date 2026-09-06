# Stage 5 — UI polish

Input: `docs/mocks/ops2-attention.html` (the approved mock, and the contract),
`03-ux.md`, `04-build.md`. Screens touched: the Attention destination only.

The build was structurally correct — right groups, right order, right hrefs,
right states, all suites green — but it rendered the mock's *content* in none of
the mock's *form*: the rows had no card, no chevron, no number slot, and the
group headings had no icon and no type treatment. Everything below is markup and
CSS. No behaviour, no data, no copy meaning changed (the copy divergences that
remain are listed at the end as findings, not fixed — see why).

## What changed

### `src/ops2/styles/attention.css` — replaced (9 lines → the mock's stylesheet)

Before, the whole file was `.att-group + .att-group { margin-top: var(--ops2-space-lg, 24px) }`
and an `h2` margin reset. Two problems: `--ops2-space-lg` / `--ops2-space-sm`
**do not exist in this console's theme** (`src/ops2/theme/spacing.css` names them
`--theme-spacing-*`), so both rules were silently resolving to their hard-coded
24px/8px fallbacks — invented values wearing a token's clothes; and nothing else
in the mock's sheet was there at all.

Now, verbatim from mock §6.1 / UX §6.1, every value a real token:

- `.att-groups` — the rhythm between groups is a flex `gap: var(--theme-spacing-xl)`
  on the container, not a `+` margin on the sections. A `+` margin makes the
  first group's spacing a different fact from every other group's.
- `.att-group__head` — icon + `<h2>` on one baseline; the icon at
  `--ds-text-muted`, the heading in the display face at `--theme-font-size-md`
  semibold, so a group heading is visibly a heading and not a bolded row.
- `.att-row` / `.att-row__count` / `.att-row__noun` — the number gets its own
  leading slot: `align-items: baseline` (so the count aligns with the *first*
  line of a wrapped noun), `min-width: 1.5ch`, `font-variant-numeric: tabular-nums`.
  Verified at 375px: `148` and `36` start at the same place and the nouns line
  up down the card.
- `.att-rows .ops2-row__open { padding-block: var(--theme-spacing-md) }` — the
  single row override the UX doc sanctions. Spacing only; it raises the touch
  target above the shared 44px floor, never lowers it.

### `src/ops2/attention/AttentionPage.tsx` — markup brought up to the mock

1. **The rows had no card.** `RowList` was called with no `className`, so the
   list rendered as bare rows on the page background — `RowList` composes its
   chrome deliberately (see its header comment) and the caller has to ask.
   Now `className="att-rows ds-surface-card"`, which is what every screenshot in
   the mock shows and what the queue's own list does.
2. **The number had no slot.** The row rendered `{row.label}` as one string.
   Now the mock's two spans, `att-row__count` + `att-row__noun`, inside
   `.att-row`. The separator between them is a real `{" "}` text node: a flex
   container does not render a whitespace-only child, so the visual gap is still
   the token's, while the button's text — and therefore its accessible name and
   `ops2-attention.spec.ts`'s `toHaveText("4 new submissions")` — is unchanged.
   `attention.ts` already exposed `noun` alongside `label` (UX §8), so no model
   change was needed.
3. **No chevron.** Every Attention row navigates, and the console's mark for
   that is `.ops2-row__chev` (rows.css already owns it). Added, `aria-hidden`.
4. **No group icon, unstyled heading.** `.att-group__head` now carries
   `DESTINATION_ICON[group.id]` beside the `<h2>` — the destination's own mark,
   so the heading and the door it opens wear the same face. Read off the shared
   registry, not re-declared here.
5. **Groups wrapped in `.att-groups`** (the section keeps `className="att-group"`,
   which the node suite pins).
6. **Skeleton shape.** Was a 24px bar + one 96px slab. Now the mock's four
   blocks — 7rem bar, 134px, 7rem bar, 45px — i.e. a four-row group plus one
   more, which is the shape that actually arrives. A skeleton that is one grey
   slab is a spinner with square corners.
7. **Empty-state caption restored to the approved copy.** It had been truncated
   to "Every queue is clear."; the mock's caption also says what will appear
   here — "New submissions, unanswered enquiries and trade applications appear
   here as they arrive." Restoring the approved sentence, not writing a new one.

Also removed: `scripts/tmp-polish.py`, an untracked scratch script left in the
working tree (its edits are the ones now in the file).

## Verification

- `npm run typecheck:gate` — green (0 fatal).
- `npm run test:ops2` — 103/103.
- `npx playwright test ops2-attention` — 10/10 (the count/noun split does not
  disturb the text assertions).
- Browser, real console, stubbed summary: 375px and 1440px, populated /
  large-numbers / empty / error. Screenshots in
  `docs/runs/ops2-attention/screens/`.

  | Shot | Reads |
  |---|---|
  | `desk-populated.png` | three grouped cards at the reading measure, mock §1 |
  | `phone-populated.png` | same order, long noun wraps to two lines with the count on the first, mock §2 |
  | `phone-long.png` | 148 / 36 / 17 tabular and aligned |
  | `desk-empty.png` | the empty panel with the full caption, mock §3 |
  | `desk-error.png` | the error panel, mock §5 layout (copy divergence below) |

## Findings not fixed — all copy/behaviour, all pinned by tests

Each is a real divergence from the approved mock. None is visual, and each is
pinned by an assertion in `scripts/tests/web/ops2-attention.spec.ts`, which is
inside Probity's scope — a UI-polish stage cannot both change the string and
update the test that guards it. These want `conduct fix`:

1. **`2 nobody has replied to`** (`attention.ts`, the `newEnquiries` noun). The
   mock and UX §3.2 both say **`waiting for a reply`**. As built, the row reads
   as a broken sentence — visible in `desk-populated.png` — and it is the only
   row whose number does not lead a grammatical phrase. Pinned by spec line 75.
2. **The counts-unavailable copy.** Mock §3.4: *"Can't tell you what's waiting."*
   / *"The counts didn't load, so none are shown. This is not an empty console —
   try again, or open Projects directly."* Built (`useSummary.ts`): *"Attention
   did not load."* / *"The server answered 500. Try again in a moment."* The
   built version also surfaces the raw HTTP status to an estimator, which the
   mock deliberately does not.
3. **The unauthorised panel still offers `Try again`.** Mock §3.5 and UX §4 are
   explicit that this state has **no retry** — pressing it fails the same way.
   The copy also differs ("This account cannot see what is waiting." vs the
   mock's "This account can't see what's waiting."). Pinned by spec line 246.

## Scope note

While writing finding 3 up I drafted a Playwright case asserting the
unauthorised panel carries no retry, and then reverted it. A polish stage does
not write tests: the assertion is red against the current build, and leaving a
red case in the shared spec would fail the verify stage for a defect this stage
is only entitled to report. The finding stands above; the test belongs to the
`conduct fix` run that changes the panel.
