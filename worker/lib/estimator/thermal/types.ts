// SCAFFOLD — Thermal selection rework (docs/estimator/thermal-selection-rework-plan.md).
// Shared types for the non-blocking thermal contract. This module is the single
// home for the vocabulary the rework introduces: a resolved band (with its
// provenance), a (frame×glass) cell, a glass pick, and a per-lite component band.
//
// Nothing here is wired into selection yet — the stubs in the sibling files are
// filled and integrated in the implementation phase. Types are stable contracts;
// the behaviour that produces/consumes them is TODO.

/** Where a resolved thermal band came from, in precedence order (plan §4/§2).
 *  'explicit_ref'  — the opening's own explicit requirement (tier 1).
 *  'shared_type'   — the per-element-type band, e.g. all awnings 0.37–0.41 (tier 2).
 *  'computed'      — our house/room thermal model (tier 3).
 *  'none'          — no band established (opening still gets a product; no thermal filter). */
export type BandBasis = "explicit_ref" | "shared_type" | "computed" | "none";

/** A thermal target band. All fields optional/nullable — an absent field is "no
 *  constraint on that axis", never zero. maxUValue is an upper cap; the SHGC pair
 *  is a range; shgcTarget is the report's preferred value used for tie-breaks. */
export interface ThermalBand {
  maxUValue: number | null;
  minShgc: number | null;
  maxShgc: number | null;
  shgcTarget: number | null;
}

/** A band plus its provenance and coherence. `incoherent` is set when the source
 *  band was impossible (min>max) — the very failure that motivated this rework;
 *  such a band is NEVER applied as a hard filter (it is dropped + flagged). */
export interface ResolvedThermalBand {
  band: ThermalBand;
  basis: BandBasis;
  incoherent: boolean;
  /** Customer/reviewer note when a band was dropped, defaulted, or unmet. */
  note: string | null;
}

/** One (frame × glass) cell — the thermal + price consequence of fitting a
 *  specific glass into THIS product's frame (plan §3). This is what today's
 *  PerformanceVariant becomes once glass is a first-class shared option: the
 *  matrix cell keyed by the glass option it realises. */
export interface GlassCell {
  /** The shared glass option this cell realises (WS1). */
  glassOptionSlug: string;
  /** The underlying performance-variant id (bridge during migration). */
  variantId: string;
  uValue: number | null;
  shgc: number | null;
  /** Private D1 surcharge ids to price this glass in this frame. */
  pricingOptionSlugs: string[];
}

/** The chosen glass for an opening/lite, and whether it satisfied the band.
 *  reviewRequired + reason carry the non-blocking WARNING when it did not. */
export interface GlassPick {
  cell: GlassCell;
  meetsBand: boolean;
  reviewRequired: boolean;
  reason: string | null;
}

/** A per-lite band for a composite (plan §2/§5). Composites carry one of these
 *  per lite instead of a single intersected parent band — the fix for the
 *  awning(0.37–0.41)+fixed(0.50–0.56) → empty-band collapse. */
export interface ComponentBand {
  /** e.g. "W1A" when the energy report named the component. */
  componentRef: string | null;
  /** awning | fixed | … — drives tier-2 (per-type) resolution when no ref band. */
  elementType: string | null;
  band: ThermalBand;
}
