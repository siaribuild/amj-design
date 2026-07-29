// Derive ESTIMATED estimator technical fields from the data already in Sanity.
//
// SAFETY: every value this produces is tagged `dataSource: "estimated"` /
// `certified: false`. These are plausible defaults so the estimator has numbers
// to compute against (per the owner's instruction) — they are NOT certified
// compliance figures and the estimator must treat them as assumption-based
// (spec §13, addendum §1). A real AFRC/WERS figure replaces them field-by-field.
//
// Pure functions (no I/O) so they can be unit-tested; populate-estimator-fields
// consumes them and writes via the Sanity mutate API.

// family slug → structured operation(s). Operation was previously only implied
// by the family name; this makes it explicit for deterministic matching.
const FAMILY_OPERATIONS = {
  "awning-window": ["awning"],
  "casement-window": ["casement"],
  "sliding-window": ["sliding"],
  "sashless-double-hung": ["double-hung"],
  "single-hung-window": ["double-hung"],
  "tilt-and-turn-window": ["tilt-turn"],
  "glass-louvre": ["louvre"],
  "glass-louver": ["louvre"],
  "sliding-door": ["sliding"],
  "casement-door": ["casement", "hinged"],
  "bi-fold-door": ["bi-fold"],
  "lift-slide-door": ["lift-slide", "sliding"],
  "pivot-door": ["pivot", "hinged"],
  "slim-frame-sliding-door": ["sliding"],
};

// Window operations that can be one leaf of a composite frame (awning+fixed…).
const COMPOSITE_CAPABLE = new Set(["awning", "casement", "fixed", "double-hung"]);

export function deriveConfiguration(product) {
  const ops = FAMILY_OPERATIONS[product.family] ?? [];
  return {
    _type: "object",
    operationTypes: ops,
    openingDirection: ops.includes("sliding") || ops.includes("lift-slide") ? "sliding"
      : product.category === "windows" ? "outward" : "outward",
    isCompositeMember: ops.some((o) => COMPOSITE_CAPABLE.has(o)),
    dataSource: "estimated",
  };
}

export function deriveDimensionRule(product) {
  const { minWidth, maxWidth, minHeight, maxHeight } = product;
  const maxAreaM2 = typeof maxWidth === "number" && typeof maxHeight === "number"
    ? Math.round(((maxWidth * maxHeight) / 1_000_000) * 100) / 100 : null;
  return {
    _type: "object",
    minWidthMm: minWidth ?? null,
    maxWidthMm: maxWidth ?? null,
    minHeightMm: minHeight ?? null,
    maxHeightMm: maxHeight ?? null,
    maxAreaM2,
    maxAspectRatio: 4.0, // conservative default; a real per-product limit replaces it
    ruleVersion: "v1",
    dataSource: "estimated",
  };
}

// Classify a glass build-up string into (doubleGlazed, lowE, gasFilled).
export function classifyGlass(glass) {
  const g = (glass || "").toLowerCase();
  const doubleGlazed = /\d\s*\+\s*\d+\s*(a|ar|argon)\s*\+\s*\d/i.test(g) || /low-?e/.test(g);
  const lowE = /low-?e/.test(g);
  // Require a digit before "ar" so "25Ar"/"15Argon" match but "clear" does not.
  const gasFilled = /\d\s*ar/i.test(g) || /argon/i.test(g);
  return { doubleGlazed, lowE, gasFilled };
}

// The T-series marker is the only catalogue-level signal currently available
// for a thermal-break family. This is an explicit TESTING assumption requested
// by the owner while manufacturer values are pending, not a product claim.
// Keeping it in one pure function makes the assumption easy to replace.
export function deriveFrameTechnology(product) {
  const identifier = `${product.slug ?? ""} ${product.name ?? ""}`.toLowerCase();
  return /\bamj(?:65|80|100|125|150)t\b/.test(identifier)
    ? "thermally_broken"
    : "conventional";
}

// Provisional whole-window Uw/SHGC estimates for aluminium systems. The
// glazing build-up drives SHGC; frame technology adjusts whole-window Uw.
// These deliberately broad testing values are always stored as estimated and
// uncertified. Manufacturer/AFRC/WERS values must replace them before they are
// used as compliance evidence.
export function deriveUwShgc(glass, frameTechnology = "conventional") {
  const { doubleGlazed, lowE, gasFilled } = classifyGlass(glass);
  const thermallyBroken = frameTechnology === "thermally_broken";
  if (!doubleGlazed) return { uValue: thermallyBroken ? 4.8 : 6.2, shgc: 0.7 };
  if (lowE && gasFilled) return { uValue: thermallyBroken ? 2.0 : 2.5, shgc: 0.4 };
  if (lowE) return { uValue: thermallyBroken ? 2.4 : 2.9, shgc: 0.45 };
  return { uValue: thermallyBroken ? 3.0 : 3.9, shgc: 0.62 };
}

export function derivePerformanceVariant(product) {
  const frameTechnology = deriveFrameTechnology(product);
  const { uValue, shgc } = deriveUwShgc(product.standardGlass, frameTechnology);
  return {
    _type: "performanceVariant",
    _key: "std",
    variantId: "std",
    glassBuildUp: product.standardGlass ?? null,
    uValue,
    shgc,
    frameType: "aluminium",
    frameTechnology,
    coating: /low-?e/i.test(product.standardGlass || "") ? "low-e (description-derived)" : null,
    pricingOptionSlugs: [],
    dataSource: "estimated",
    certified: false,
    published: true,
  };
}

// The full patch payload for one product.
export function deriveEstimatorFields(product) {
  return {
    configuration: deriveConfiguration(product),
    dimensionRule: deriveDimensionRule(product),
    performanceVariants: [derivePerformanceVariant(product)],
    // The rate card's OWN id, not a decorative token. It was `price.<slug>.v1`,
    // which matched nothing: pricing_rate_card is keyed on the product slug
    // (migration 0031), and both the coverage gate and priceLine() use this
    // value as that id. The mismatch failed every AI job with
    // `pricing_catalogue_not_ready` before it reached the provider.
    pricingRef: product.slug,
    schemaVersion: 1,
  };
}
