# 0010 — ops2 shares the customer's Elevation generator

**Status:** accepted · **Date:** 2026-08-23
**Design:** `docs/specs/ops2-record-design.md` · **Spec:** `docs/specs/ops2-record-correction.md`

## Context

The ops2 record shipped without the opening drawing because a session decided the whole
of `src/components/quote-project/` was unusable in ops2 — reasoning from the true fact
that *some* of it is bound to the customer site's Tailwind theme, without checking file
by file. The owner rejected the surface; the elevation is the element he rates highest
in the product.

`src/components/quote-project/Elevation.tsx` imports exactly one module
(`src/data/catalogue`), renders pure SVG, names no router and no theme sheet.
`scripts/tests/ops2-deps.test.mjs` already lists `src/components/quote-project` among
the files "compiled into BOTH graphs" and holds them router-free.

## Decision

ops2 imports `Elevation` directly from
`src/components/quote-project/Elevation.tsx`.

> **Amended 2026-08-25 (owner ruling D12, spec `ops2-why-this-product.md` VIEW-AC-12).**
> This decision originally read "`Elevation` (and `ElevationLegend`)". **`ElevationLegend`
> no longer exists.** ops2 stopped rendering the symbol key under R25 — ops staff read
> elevations for a living — and the export then turned out to have had no other consumer:
> zero callers repo-wide, and no `.elev-legend` rule in any stylesheet, so its markup could
> not have rendered correctly for any caller it might have found. It was added by the ops2
> record work for the very plate that stopped rendering it. The decision below stands
> exactly as written for the generator itself, which is the part that is genuinely shared;
> `scripts/tests/ops2-frame.test.mjs` now asserts the legend's absence, so this cannot be
> quietly reintroduced. The generator is one module with two
skins: each console styles the SVG's container and supplies `--paper`; the drawing
arithmetic exists once.

Additive extensions land in the shared file, never in a fork: the `hero` size row
(R-49 — the generator is called at the size closest to the intended pixels) lives
there. (The `ElevationLegend` export named here originally was removed by D12 — see
the amendment above.)

## The boundary rule, restated so it cannot be misread again

The ops2 boundary bans **the customer's theme and router** from the ops2 graph — it has
never banned router-free, theme-free shared components. The test of importability is the
file's own import list, checked file by file, not the directory it sits in.
`scripts/tests/ops2-deps.test.mjs` remains the mechanical guard: a shared file that
grows a router import fails there, in node, before either bundle is built.

## Consequences

- ops2 must hydrate the Sanity catalogue at boot (`Elevation` resolves families through
  `getProductBySlug`); its boot mirrors `src/ops/main.tsx` — timeout-capped, fail-open
  onto the built-in catalogue.
- ops2 stylesheets must define `--paper` wherever an elevation draws at `sm` or larger
  (leader halo and break-line fill read it; undefined computes to black).
- A change to the drawing arithmetic now serves both consoles at once — which is the
  point, and also the reason any such change needs both surfaces looked at.
