// worker/lib/estimator/types.ts
var SUPPORTED_SCHEMA_VERSION = 1;

// node_modules/groq/lib/groq.js
function defineQuery(query) {
  return query;
}

// worker/lib/estimator/catalogue.ts
var CANDIDATE_QUERY = defineQuery(`*[_type == "product" && defined(name) && defined(schemaVersion)
  && ($family == "" || category->slug.current == $family)
  && ($operation == "" || family->operation == $operation)]{
  "sanityProductId": _id,
  "catalogueRevision": _rev,
  schemaVersion,
  name,
  "slug": slug.current,
  "family": category->slug.current,
  "series": family->slug.current,
  "seriesOperation": family->operation,
  // What goes NEXT to this product when an opening is too wide for one frame.
  // Authored once per family; the estimator reads it off whichever product it
  // picked, so an opening never has to look the family up separately.
  // infillOperation rides along because the split proposal speaks operations,
  // not family slugs \u2014 without it the caller would need a second round trip
  // purely to learn that "fixed-window" performs "fixed".
  "defaultSplit": family->defaultSplit{
    "infillFamilySlug": infillFamily->slug.current,
    "infillOperation": infillFamily->operation,
    minInfillMm
  },
  // SCAFFOLD (product compatibility, C3): the extrusion PLATFORM this frame is
  // built on, and the other platforms it may be coupled with. Absent on every
  // product an editor has not tagged, which is UNKNOWN \u2014 never "incompatible" \u2014
  // so the catalogue keeps working untouched while it is being authored.
  // The edges are dereferenced to SLUGS for the same reason defaultSplit is: the
  // selector resolves systems by slug and a Sanity document id would be a
  // reference nothing downstream can follow.
  "frameSystem": frameSystem->{
    "slug": slug.current,
    name,
    "compatibleWith": compatibleWith[]{ "slug": system->slug.current, severity }
  },
  // Withdrawn from sale. PROJECTED, NOT FILTERED IN THE QUERY: ops reads this same
  // repository to list configurations and to revalidate a line whose product was
  // disabled after it was quoted, so a product that vanished here would take ops's
  // access with it. selectForOpening does the excluding, and only for the machine.
  disabled,
  dimensionRule,
  // The product's glazing \xD7 thermal matrix comes from its shared frame profile
  // (M2/D5). Preferred over the legacy per-product performanceVariants below,
  // which stays as a fallback until every product carries a profile.
  "thermalProfile": thermalProfile->{
    frameTechnology,
    "rows": rows[]{
      "glazingOptionSlug": glazing->slug.current,
      "glazingClass": glazing->technicalValue,
      uValue, shgc, frameTechnology, certified, certificationRef, published, wersWindowId
    }
  },
  "performanceVariants": performanceVariants[]{
    variantId, uValue, shgc, frameType, frameTechnology,
    pricingOptionSlugs, dataSource, certified, certificationRef, published,
    "glazingOptionSlug": glazingOption->slug.current,
    "glazingClass": glazingOption->technicalValue
  },
  "optionGroups": options[].option->optionType->slug.current,
  pricingRef
}`);
var VALID_GLAZING_CLASSES = /* @__PURE__ */ new Set([
  "single_clear",
  "single_toned",
  "single_lowe",
  "double_clear",
  "double_toned",
  "double_lowe",
  "triple_clear",
  "triple_toned",
  "triple_lowe"
]);
var canonicalGlazingClass = (cls) => cls.replace(/_low_e$/, "_lowe");
var coerceFrameTech = (v) => v === "conventional" || v === "thermally_broken" ? v : "unknown";
function toFrameSystem(raw) {
  const slug = typeof raw?.slug === "string" && raw.slug ? raw.slug : null;
  if (!slug) return null;
  const edges = Array.isArray(raw?.compatibleWith) ? raw.compatibleWith : [];
  const seen = /* @__PURE__ */ new Set();
  return {
    slug,
    name: typeof raw?.name === "string" && raw.name ? raw.name : null,
    compatibleWith: edges.flatMap((e) => {
      const to = typeof e?.slug === "string" && e.slug ? e.slug : null;
      if (!to || to === slug || seen.has(to)) return [];
      seen.add(to);
      return [{ slug: to, severity: e?.severity === "preferred" ? "preferred" : "allowed" }];
    })
  };
}
function profileRowsToVariants(profile) {
  const rows = Array.isArray(profile?.rows) ? profile.rows : [];
  const profileTech = profile?.frameTechnology;
  const seen = /* @__PURE__ */ new Set();
  return rows.flatMap((r) => {
    const slug = typeof r?.glazingOptionSlug === "string" && r.glazingOptionSlug ? r.glazingOptionSlug : null;
    if (!slug || seen.has(slug)) return [];
    const cls = typeof r?.glazingClass === "string" && r.glazingClass ? canonicalGlazingClass(r.glazingClass) : null;
    if (cls && !VALID_GLAZING_CLASSES.has(cls)) return [];
    seen.add(slug);
    return [{
      variantId: slug,
      glazingOptionSlug: slug,
      glazingClass: cls,
      uValue: typeof r?.uValue === "number" && r.uValue >= 0.5 && r.uValue <= 10 ? r.uValue : null,
      shgc: typeof r?.shgc === "number" && r.shgc >= 0 && r.shgc <= 1 ? r.shgc : null,
      frameType: "aluminium",
      frameTechnology: coerceFrameTech(r?.frameTechnology ?? profileTech),
      certificationRef: r?.certificationRef ?? r?.wersWindowId ?? null,
      pricingOptionSlugs: [],
      dataSource: r?.certified === false ? "estimated" : "certified",
      certified: r?.certified !== false,
      published: r?.published !== false
    }];
  });
}
function toCandidate(row) {
  if (!row?.sanityProductId) return null;
  const schemaVersion = typeof row.schemaVersion === "number" ? row.schemaVersion : null;
  if (schemaVersion == null || schemaVersion > SUPPORTED_SCHEMA_VERSION) return null;
  const profileVariants = profileRowsToVariants(row.thermalProfile);
  const perf = profileVariants.length ? [] : Array.isArray(row.performanceVariants) ? row.performanceVariants : [];
  const seenVariants = /* @__PURE__ */ new Set();
  const legacyVariants = perf.flatMap((v) => {
    const variantId = String(v?.variantId ?? "").trim();
    const uValue = typeof v?.uValue === "number" && v.uValue >= 0.5 && v.uValue <= 10 ? v.uValue : null;
    const shgc = typeof v?.shgc === "number" && v.shgc >= 0 && v.shgc <= 1 ? v.shgc : null;
    if (!variantId || seenVariants.has(variantId)) return [];
    if (v?.certified === true && (!v?.certificationRef || v?.dataSource !== "certified")) return [];
    seenVariants.add(variantId);
    return [{
      variantId,
      // The shared glazing option this (frame×glass) cell realises: its slug is
      // the glass identity and its technicalValue (glazingClass) is the single/
      // double/low-e classification — no longer parsed from a free-text build-up.
      glazingOptionSlug: typeof v?.glazingOptionSlug === "string" && v.glazingOptionSlug ? v.glazingOptionSlug : null,
      glazingClass: typeof v?.glazingClass === "string" && v.glazingClass ? canonicalGlazingClass(v.glazingClass) : null,
      uValue,
      shgc,
      frameType: v?.frameType ?? null,
      frameTechnology: v?.frameTechnology === "conventional" || v?.frameTechnology === "thermally_broken" ? v.frameTechnology : "unknown",
      certificationRef: v?.certificationRef ?? null,
      pricingOptionSlugs: Array.isArray(v?.pricingOptionSlugs) ? v.pricingOptionSlugs.filter((s) => typeof s === "string" && !!s).slice(0, 20) : [],
      dataSource: String(v?.dataSource ?? "estimated"),
      certified: v?.certified === true,
      published: v?.published !== false
    }];
  });
  const variants = profileVariants.length ? profileVariants : legacyVariants;
  const seriesOperation = typeof row.seriesOperation === "string" && row.seriesOperation ? row.seriesOperation : null;
  const operationTypes = seriesOperation ? [seriesOperation] : [];
  const configuration = operationTypes.length ? { operationTypes } : null;
  return {
    sanityProductId: String(row.sanityProductId),
    catalogueRevision: String(row.catalogueRevision ?? ""),
    schemaVersion,
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    family: row.family ?? null,
    series: row.series ?? null,
    configuration,
    // Absent on every family but the ones an editor has authored — which is the
    // "do not pair" default, and is why this is passed through as-is rather than
    // defaulted here. proposePairedLayout owns what a missing knob means.
    defaultSplit: row.defaultSplit?.infillFamilySlug ? row.defaultSplit : null,
    frameSystem: toFrameSystem(row.frameSystem),
    disabled: row.disabled === true,
    dimensionRule: row.dimensionRule ?? null,
    performanceVariants: variants,
    optionGroups: Array.isArray(row.optionGroups) ? [...new Set(row.optionGroups.filter(Boolean))] : [],
    pricingRef: row.pricingRef ?? null
  };
}
var CACHE_TTL_MS = 5 * 60 * 1e3;

// worker/lib/estimator/thermal/precedence.ts
function bandHasConstraint(b) {
  return b.maxUValue != null || b.minShgc != null || b.maxShgc != null;
}
function coerceCoherent(band) {
  let altered = false;
  let { maxUValue, minShgc, maxShgc } = band;
  const shgcTarget = band.shgcTarget;
  if (maxUValue != null && !(maxUValue > 0)) {
    maxUValue = null;
    altered = true;
  }
  if (minShgc != null && maxShgc != null && minShgc > maxShgc) {
    minShgc = null;
    maxShgc = null;
    altered = true;
  }
  if (minShgc != null && (minShgc < 0 || minShgc > 1)) {
    minShgc = null;
    altered = true;
  }
  if (maxShgc != null && (maxShgc < 0 || maxShgc > 1)) {
    maxShgc = null;
    altered = true;
  }
  const coerced = { maxUValue, minShgc, maxShgc, shgcTarget };
  if (!bandHasConstraint(coerced) && shgcTarget == null) return { band: null, altered };
  return { band: coerced, altered };
}

// worker/lib/estimator/rules.ts
var RULE_VERSION = "v2-thermal-nonblocking";
function checkDimensions(opening, c) {
  const rule = c.dimensionRule;
  const w = opening.widthMm ?? 0, h = opening.heightMm ?? 0;
  if (!rule) return { filter: "dimensions", passed: false, severity: "incomplete", reason: "no dimension rule" };
  if (!w || !h) return { filter: "dimensions", passed: false, severity: "manual_review", reason: "opening size unknown" };
  const within = (v, min, max) => (min == null || v >= min) && (max == null || v <= max);
  if (!within(w, rule.minWidthMm, rule.maxWidthMm) || !within(h, rule.minHeightMm, rule.maxHeightMm)) {
    return { filter: "dimensions", passed: false, severity: "warning", reason: `size ${h}\xD7${w} outside ${rule.minHeightMm ?? "?"}\u2013${rule.maxHeightMm ?? "?"} \xD7 ${rule.minWidthMm ?? "?"}\u2013${rule.maxWidthMm ?? "?"} mm \u2014 composite/custom unit, indicative price` };
  }
  if (rule.maxAreaM2 != null && w * h / 1e6 > rule.maxAreaM2 + 1e-3) {
    return { filter: "dimensions", passed: false, severity: "warning", reason: `area ${(w * h / 1e6).toFixed(2)} m\xB2 exceeds ${rule.maxAreaM2} m\xB2 \u2014 composite/custom unit, indicative price` };
  }
  if (rule.maxAspectRatio != null) {
    const ar = Math.max(w, h) / Math.max(1, Math.min(w, h));
    if (ar > rule.maxAspectRatio + 0.01) return { filter: "dimensions", passed: false, severity: "warning", reason: `aspect ${ar.toFixed(1)} exceeds ${rule.maxAspectRatio} \u2014 composite/custom unit, indicative price` };
  }
  return { filter: "dimensions", passed: true };
}
function checkEnergy(opening, c) {
  const req = effectiveThermalRequirements(opening);
  const maxU = req?.maxUValue ?? null, minShgc = req?.minShgc ?? null, maxShgc = req?.maxShgc ?? null;
  if (maxU == null && minShgc == null && maxShgc == null) {
    return {
      outcome: { filter: "energy", passed: true },
      certified: false,
      matching: c.performanceVariants.filter((v) => v.published)
    };
  }
  const variants = c.performanceVariants.filter((v) => v.published);
  if (!variants.length) {
    return { outcome: { filter: "energy", passed: false, severity: "incomplete", reason: "no published performance variant" }, certified: false, matching: [] };
  }
  const satisfies = (v) => (maxU == null || v.uValue != null && v.uValue <= maxU) && (minShgc == null || v.shgc != null && v.shgc >= minShgc) && (maxShgc == null || v.shgc != null && v.shgc <= maxShgc);
  const match = variants.filter(satisfies);
  if (!match.length) {
    return {
      outcome: { filter: "energy", passed: false, severity: "warning", reason: "no glass meets the thermal band \u2014 closest selected, confirm at review" },
      certified: false,
      matching: variants
    };
  }
  const certified = match.some((v) => v.certified && v.dataSource === "certified");
  return {
    outcome: { filter: "energy", passed: true, reason: certified ? void 0 : "met by estimated (uncertified) performance data" },
    certified,
    matching: match
  };
}
function effectiveThermalRequirements(opening) {
  const explicit = opening.requirements ?? null;
  let merged;
  if (opening.thermalContext?.requirementBasis === "explicit_energy_report") {
    merged = explicit;
  } else {
    const learned = opening.advisoryRequirements ?? null;
    if (!explicit) merged = learned;
    else if (!learned) merged = explicit;
    else merged = {
      maxUValue: minLimit(explicit.maxUValue, learned.maxUValue),
      minShgc: maxLimit(explicit.minShgc, learned.minShgc),
      maxShgc: minLimit(explicit.maxShgc, learned.maxShgc)
    };
  }
  if (!merged) return null;
  const { band } = coerceCoherent({ maxUValue: merged.maxUValue ?? null, minShgc: merged.minShgc ?? null, maxShgc: merged.maxShgc ?? null, shgcTarget: null });
  if (!band) return null;
  return { maxUValue: band.maxUValue, minShgc: band.minShgc, maxShgc: band.maxShgc };
}
var minLimit = (a, b) => a == null ? b ?? null : b == null ? a : Math.min(a, b);
var maxLimit = (a, b) => a == null ? b ?? null : b == null ? a : Math.max(a, b);
var isDoubleGlazed = (variant) => /^(double|triple)_/.test(variant.glazingClass ?? "");
var isSingleGlazed = (variant) => /^single_/.test(variant.glazingClass ?? "");
var isLowE = (variant) => /_lowe$/.test(variant.glazingClass ?? "");
function checkScheduleConfiguration(opening, c) {
  const schedule = opening.scheduleRequirements;
  const glass = (schedule?.glassDescription ?? "").toLowerCase();
  const requiresDouble = schedule?.doubleGlazed === true;
  const requiresSingle = schedule?.doubleGlazed === false;
  const requiresLowE = /\blow[- ]?e\b/.test(glass);
  if (!requiresDouble && !requiresSingle && !requiresLowE) {
    return {
      outcome: { filter: "schedule_configuration", passed: true },
      matching: c.performanceVariants.filter((variant) => variant.published)
    };
  }
  const published = c.performanceVariants.filter((variant) => variant.published);
  if (!published.length) {
    return {
      outcome: {
        filter: "schedule_configuration",
        passed: false,
        severity: "incomplete",
        reason: "schedule specifies a material glazing configuration but the product has no published variants"
      },
      matching: []
    };
  }
  const classified = published.filter((variant) => !!variant.glazingClass);
  if (!classified.length) {
    return {
      outcome: {
        filter: "schedule_configuration",
        passed: false,
        severity: "incomplete",
        reason: "schedule specifies a glazing configuration but the product's variants have no glazing option set"
      },
      matching: []
    };
  }
  const matching = classified.filter((variant) => (!requiresDouble || isDoubleGlazed(variant)) && (!requiresSingle || isSingleGlazed(variant)) && (!requiresLowE || isLowE(variant)));
  if (!matching.length) {
    const requested = [
      requiresDouble ? "double glazing" : null,
      requiresSingle ? "single glazing" : null,
      requiresLowE ? "Low-E coating" : null
    ].filter(Boolean).join(", ");
    return {
      outcome: {
        filter: "schedule_configuration",
        passed: false,
        severity: "reject",
        reason: `no published variant matches the schedule requirement: ${requested}`
      },
      matching: []
    };
  }
  return { outcome: { filter: "schedule_configuration", passed: true }, matching };
}
function checkHardRules(opening, c, ruleVersion = RULE_VERSION) {
  const filters = [];
  filters.push(c.schemaVersion != null ? { filter: "publication", passed: true } : { filter: "publication", passed: false, severity: "reject", reason: "unpublished/unversioned" });
  const ops = c.configuration?.operationTypes ?? [];
  const wantsOp = opening.operationType ?? null;
  filters.push(!wantsOp || ops.includes(wantsOp) ? { filter: "operation", passed: true } : { filter: "operation", passed: false, severity: "reject", reason: `does not support operation '${wantsOp}'` });
  filters.push(checkDimensions(opening, c));
  const energy = checkEnergy(opening, c);
  filters.push(energy.outcome);
  const schedule = checkScheduleConfiguration(opening, c);
  filters.push(schedule.outcome);
  const scheduleIds = new Set(schedule.matching.map((variant) => variant.variantId));
  let eligibleVariants = energy.matching.filter((variant) => scheduleIds.has(variant.variantId));
  if (energy.outcome.passed && schedule.outcome.passed && (energy.matching.length || schedule.matching.length) && !eligibleVariants.length) {
    eligibleVariants = schedule.matching.length ? schedule.matching : energy.matching;
    filters.push({
      filter: "schedule_configuration",
      passed: false,
      severity: "warning",
      reason: "no single variant meets both the thermal and glazing requirement \u2014 closest selected, confirm at review"
    });
  }
  const rejected = filters.some((f) => !f.passed && f.severity === "reject");
  const incomplete = filters.some((f) => !f.passed && f.severity === "incomplete");
  const review = filters.some((f) => !f.passed && f.severity === "manual_review");
  const warned = filters.some((f) => !f.passed && f.severity === "warning");
  let status;
  let passed;
  if (rejected) {
    status = "unavailable";
    passed = false;
  } else if (incomplete) {
    status = "catalogue_data_incomplete";
    passed = false;
  } else if (review) {
    status = "needs_manual_review";
    passed = false;
  } else if (warned) {
    status = "commercial_only_estimate";
    passed = true;
  } else if (energyHadRequirement(opening) && !energy.certified) {
    status = "commercial_only_estimate";
    passed = true;
  } else {
    status = "ready";
    passed = true;
  }
  return {
    candidateId: c.sanityProductId,
    ruleVersion,
    passed,
    status,
    energyCertified: energy.certified,
    eligibleVariantIds: eligibleVariants.map((v) => v.variantId),
    filters
  };
}
function energyHadRequirement(opening) {
  const r = effectiveThermalRequirements(opening);
  return !!r && (r.maxUValue != null || r.minShgc != null || r.maxShgc != null);
}
export {
  RULE_VERSION,
  checkHardRules,
  toCandidate
};
