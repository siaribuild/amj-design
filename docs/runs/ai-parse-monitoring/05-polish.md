# 05 — UI polish: AI parse monitoring on Attention

Audited the built result against the approved mock (`docs/mocks/ai-parse-monitoring.html`)
and the UX spec (`03-ux.md` §§2–9), then brought it up to the mock. Visual and
structural changes only — no behaviour, no data, no invented copy. Files changed
are the T5/T6 frontend files from `04-build.md`, plus two Playwright assertions
that had encoded the built copy rather than the approved copy.

## Files touched

| File | What changed |
|---|---|
| `src/ops2/attention/AttentionPage.tsx` | Monitoring section rewritten to the mock's structure and copy sheet (the summary section above it untouched) |
| `src/ops2/attention/useMonitoring.ts` | Two pure formatters added (`snapshotAge`, `formatDayLabel`); error copy aligned to §9 |
| `src/ops2/styles/attention.css` | Monitoring block rewritten on real tokens; phone rules moved onto the console's single change point |
| `src/ops2/chrome/OpsPage.tsx` | Desk bell badge renders the number; `aria-label` states the count |
| `src/ops2/Ops2App.tsx` | Phone tab badge renders the number |
| `src/ops2/styles/nav.css` | Both badges are numeric pills, not dots |
| `scripts/tests/web/ops2-attention.spec.ts` | Two assertions re-pointed at the approved copy |

## What was wrong, and what it is now

1. **No freshness line.** The mock's governing sentence — one statement over
   every figure below it — was missing entirely. Now rendered in `OpsPage`'s
   `identity` slot (desk toolbar and phone band, one implementation):
   *"As at 06:49 · refreshes every 10 minutes"*, and when the snapshot is older
   than 30 minutes it turns warning-ink with the icon and the mock's sentence:
   *"Not refreshed since 04:43 — 2h 10m ago. The 10-minute job may have stopped."*
2. **Four anonymous boxes.** The mock groups them as two named pairs —
   `AI BUDGET` and `PARSING · LAST 7 DAYS`. Added, with the mock's
   `.att-group__label` treatment; the two questions now read as two questions.
3. **Card copy was the developer's, not the sheet's.** Labels, notes and the cap
   sentence now match §9 verbatim (`Credit balance` / "USD, as Cloudflare reports
   it"; `Cap remaining` / "$8.40 of the $20.00 gateway cap used (42%)";
   `Parses succeeded` / "One parse = one job claim"; `Parses errored` / "Failed,
   or stuck over 30 minutes").
4. **Cards had no shadow.** `.att-card` used `var(--shadow-sm)` — that token does
   not exist in ops2 (it is a mock-local alias), so the declaration was dead and
   the cards sat flat on the page. Now `var(--ds-layer-raised)`, the console's
   real raised-surface token.
5. **The `unavailable` state was the bare lowercase word.** Now the mock's em
   dash in muted ink plus the reason sentence — *"Unavailable. No Cloudflare
   token configured"* or *"Unavailable. Cloudflare did not answer at 06:49"*.
   Never a zero, never red: a missing number is a missing number.
6. **Per-card `as at` stamps** are drawn only while the page is stale
   (criterion 6), instead of repeating one timestamp five times on a healthy page.
7. **Chart had no head and no legend.** Added `SUCCESSES AND ERRORS BY DAY` plus
   the two-series legend, keyed to the same two hues the count cards carry, so a
   card and its bars read as one fact.
8. **Zero days vanished.** A zero bucket now keeps its 2px baseline stub in
   `--ds-border-default`; a day with no parses is visibly a zero, not a gap.
9. **A zero week dropped the axis.** The all-zero state now keeps its seven day
   labels under the sentence — the window being described stays on screen — with
   the mock's copy: *"Nothing parsed in the last 7 days"*.
10. **Day labels.** `Thu 3` / `Fri 4`, with today bolded as `Today`, per §5.
11. **Per-bar numerals** above each bar at desk, hidden on the phone (two digits
    over a 12px bar is a smudge, and both totals are stated in the count cards a
    thumb-length above).
12. **Chart accessibility.** The plot is `role="img"` with an aria-label stating
    both totals, so a screen reader gets the fact without walking 14 bars.
13. **Badges were dots.** UX §7 and the mock specify a numeric pill; the desk
    bell and the phone tab now show the count in a 16px `--ds-color-error` pill
    (tabular numerals, ringed against the toolbar surface). The bell's
    `aria-label` states the number instead of the bare word "Attention".
14. **A stray media query.** The monitoring CSS had its own
    `@media (max-width: 480px)`. The console has exactly one change point
    (`RAIL_MEDIA_QUERY`, read by `useRailWidth`) and `nav.css` forbids restating
    it in CSS, so the narrow rules now hang off the attribute `OpsPage` already
    writes for that same decision: `.ops2-page__body[data-bare="true"]`.
15. **`.att-group` name collision.** The summary groups above and the mock's
    monitoring groups share the class name; the monitoring rules are now scoped
    under `.att-monitoring` so neither layout leaks into the other.
16. **Phone stale-line alignment.** The warning icon was vertically centred, so
    on the phone — where the sentence wraps to two lines — it floated between
    them. Now top-aligned to the first line.

## Verification

- `npm run typecheck:gate` — clean; the 61 non-fatal findings are pre-existing
  and unchanged in the touched files.
- `npm run test:ops2` — 106/106.
- `npx playwright test scripts/tests/web/ops2-attention.spec.ts` — 16/16.
- Impeccable mechanical detector over the four changed UI files — no findings.
- Screenshots at desk 1440 and phone 375, six states, in
  `docs/runs/ai-parse-monitoring/shots/`: `desk-healthy`, `desk-stale`,
  `desk-unavailable-zero`, `desk-badge`, `phone-healthy`, `phone-stale`.

Two Playwright assertions were re-pointed at the approved copy after being seen
to fail red: `toContainText("unavailable")` → the full sentence, and the all-zero
chart's "No parse activity this week." → "Nothing parsed in the last 7 days" with
seven `.att-col` labels and zero `.att-bar`. The mock is the contract; those two
assertions had encoded the implementation.

## Findings NOT fixed, and why

- **The mock's red money card cannot be rendered — the snapshot carries no
  flags.** Mock/UX criteria 16–17 put the credit-balance card in a red state when
  the balance is under the floor or the cap is over the ceiling, with the note
  *"Floor $5.00 · below it, parsing stops"*. `evaluateRed` and the thresholds
  exist in the worker (`AI_CREDIT_FLOOR_USD`, `AI_CAP_CEILING_PCT`), but neither
  the flag nor the threshold values appear in the `/api/ops/monitoring` payload
  the page receives, and UX §4 forbids the client re-deriving red from raw
  numbers. So no card can turn red today — while `notificationCount` already
  lights the bell from that same server-side evaluation. **The console can show
  "1" on the bell with nothing red on the page.** This is a data gap, not a CSS
  gap: the fix is the developer shipping the precomputed red flag (and the floor
  value the note prints) in the snapshot. Not fixed here because inventing a
  client-side threshold is exactly what the spec rules out.
- **`width="full"` also widens the pre-existing summary rows.** The monitoring
  grid needs the full page width; the attention rows above inherit it and now run
  edge to edge rather than at their old measure. Left as is — one block edge down
  the page reads as intentional, and capping only the rows would leave the page
  ragged. Flagged because it is a visible change to a screen this feature did not
  otherwise set out to touch.
- **`2h 10m ago`, not the mock's `2 h 10 m ago`.** Kept the tight form: the
  spaced version reads as a typo inside a running sentence at 12px.
- **Bars stay 20px at every desk width.** At 1440 the plot is ~1180px wide, so
  the columns are airy. The mock's own `.att-plot` is an uncapped
  `repeat(7, 1fr)` and behaves identically at that width, so this is the approved
  layout — capping the plot would be a redesign, not polish.
