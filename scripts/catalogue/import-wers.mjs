// SCAFFOLD (glazing/thermal, M6) — WERS → catalogue importer skeleton.
//
// Turns the manufacturer WERS export into: (1) shared glazing `option` docs
// (grouped SG/DG/TG × glass type), (2) shared `thermalProfile` docs per frame
// (the glazing × Uw/SHGC/stars matrix), (3) product → profile references, and
// (4) the NEW Fixed Window family + products (D3). Hardware-twin products share
// one profile (D5). The frame→product mapping below is OWNER-CONFIRMED (D4).
//
// STATUS: skeleton. Parsing + doc-building are real; the WRITE step is a TODO so
// this cannot mutate the live dataset until M6 is finished. Run pattern (M6):
//   node scripts/catalogue/import-wers.mjs <unzipped-wers-dir> --write
//
// Dataset writes go via the Sanity mutate API / `sanity dataset import` with
// dot-free ids and an idempotent createOrReplace, then a validation pass (below).

import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Owner-confirmed frame → product slug mapping (D4). ────────────────────────
// One WERS FrameDescription may map to SEVERAL products (hardware twins) — they
// SHARE the one profile (D5). `null`-valued entries import glazing docs only.
const FRAME_TO_PRODUCTS = {
  // Clean mappings
  "AMJ80 Awning": ["amj80-series-awning-window"],
  "AMJ100L Awning": ["amj100l-series-awning-window"],
  "AMJ100T Awning Window": ["amj100t-awning-window", "amj100t-series-awning-window"], // D5 twin share
  "AMJ80 Sliding Window": ["amj80-series-sliding-window"],
  "AMJ80 Sliding Door": ["amj80-series-sliding-door"],
  "AMJ100L Sliding Door": ["amj100l-series-sliding-door"],
  "AMJ100T Sliding Door": ["amj100t-series-sliding-door"],
  "AMJ100T Casement Door": ["amj100t-series-casement-door"],
  "AMJ80T Hinged Door": ["amj80t-casement-door"],
  "AMJ68 BiFold Door": ["amj68-series-bi-fold-door"],
  // Tentative — CONFIRMED by owner (D4)
  "AMJ155T Lift and Slide Door": ["amj150t-lift-sliding-door"],
  "AMJ150T TB Awning Window": ["amj150-series-awning-window"],
  "AMJ83 Double Hung": ["amj100t-series-sashless-double-hung"],
  // Fixed Window — NEW products created by this importer (D3)
  "AMJ100T Fixed Window": ["amj100t-fixed-window"],
  "AMJ80ST Fixed Window": ["amj80st-fixed-window"],
  "AMJ100L Fixed Window": ["amj100l-fixed-window"],
  "AMJ67T Fixed Window": ["amj67t-fixed-window"],
  "AMJ150 Fixed Window": ["amj150-fixed-window"],
};

// Frames intentionally NOT attached to a product (no matching product today).
// Their glazing `option` docs still import (shared, reusable later). Several are
// plausible product GAPS worth an owner decision (best Uw in the export):
//   AMJ67T Awning (2.0–2.2), AMJ80T TB Awning (thermally broken) — flagged, not auto-added.
const UNMAPPED_FRAMES = [
  "AMJ100 Awning", "AMJ100LST Awning Window", "AMJ80T TB Awning Window",
  "AMJ67T Awning Window", "AMJ100T Sliding Window", "AMJ100L Sliding Window",
  "AMJ100 Sliding Door",
];

// ── NEW docs for D3 (Fixed Window family + products). ─────────────────────────
const NEW_FAMILY = { _id: "family-fixed-window", _type: "family", name: "Fixed Window", operation: "fixed" }; // + slug, category(windows), aliases — TODO
const NEW_FIXED_PRODUCTS = [
  "amj100t-fixed-window", "amj80st-fixed-window", "amj100l-fixed-window",
  "amj67t-fixed-window", "amj150-fixed-window",
];

// ── Parse (real) ──────────────────────────────────────────────────────────────
// Reads an unzipped .xlsx dir (xl/sharedStrings.xml + xl/worksheets/sheet1.xml).
export function parseWers(unzippedDir) {
  const ss = readFileSync(join(unzippedDir, "xl/sharedStrings.xml"), "utf8");
  const strings = [];
  for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    strings.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("").replace(/&amp;/g, "&"));
  }
  const sheet = readFileSync(join(unzippedDir, "xl/worksheets/sheet1.xml"), "utf8");
  const rows = [];
  for (const r of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const c = {};
    for (const m of r[1].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*?t="([^"]*)")?[^>]*>(?:<v>([\s\S]*?)<\/v>)?/g)) {
      if (m[3] == null) continue;
      c[m[1]] = m[2] === "s" ? strings[Number(m[3])] : m[3];
    }
    rows.push(c);
  }
  const [header, ...data] = rows;
  const col = (letter, name) => { void name; return letter; };
  // Columns: C FrameDescription, H GlassSpecification, I GlassType, J GlazingDisplayName,
  // K long, L HeatingStars, M CoolingStars, N HeatingPct, O CoolingPct, P Uw, Q SHGC, R Tvw, S AI, A WindowId.
  void header; void col;
  return data.map((r) => ({
    windowId: r.A, frame: r.C, spec: r.H, glassType: r.I, glazing: r.J, glazingLong: r.K,
    heatingStars: num(r.L), coolingStars: num(r.M), heatingPct: num(r.N), coolingPct: num(r.O),
    uValue: num(r.P), shgc: num(r.Q), tvw: num(r.R), airInfiltration: num(r.S),
  }));
}
const num = (v) => (v == null || v === "" ? null : Number(v));

// dot-free slug (Sanity forbids '.' in _id).
export const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const glassTypeKey = (t) => ({ "clear": "clear", "toned": "toned", "low-e": "low_e" }[String(t).toLowerCase()] ?? "clear");
// Derive the machine class from spec + type (constrained enum — M2).
const glazingClass = (spec, type) => `${{ SG: "single", DG: "double", TG: "triple" }[spec] ?? "double"}_${glassTypeKey(type)}`;

// ── Build (structured; writes are TODO) ───────────────────────────────────────
export function buildGlazingDocs(rows) {
  const byName = new Map();
  for (const r of rows) {
    if (byName.has(r.glazing)) continue;
    byName.set(r.glazing, {
      _id: `glazing-${slugify(r.glazing)}`,
      _type: "option",
      name: r.glazing,
      slug: { _type: "slug", current: slugify(r.glazing) },
      // TODO(M6): reference the glazing optionType; set glassSpecification/glassType/technicalValue:
      glassSpecification: r.spec, glassType: glassTypeKey(r.glassType),
      technicalValue: glazingClass(r.spec, r.glassType),
    });
  }
  return [...byName.values()];
}

export function buildThermalProfiles(rows) {
  const byFrame = new Map();
  for (const r of rows) {
    if (!(r.frame in FRAME_TO_PRODUCTS)) continue; // unmapped frames: glazing docs only
    if (!byFrame.has(r.frame)) byFrame.set(r.frame, { _id: `thermal-${slugify(r.frame)}`, _type: "thermalProfile", name: r.frame, slug: { _type: "slug", current: slugify(r.frame) }, rows: [] });
    byFrame.get(r.frame).rows.push({
      _type: "thermalProfileRow", _key: slugify(`${r.frame}-${r.glazing}`),
      glazing: { _type: "reference", _ref: `glazing-${slugify(r.glazing)}` },
      uValue: r.uValue, shgc: r.shgc, tvw: r.tvw,
      heatingStars: r.heatingStars, coolingStars: r.coolingStars,
      heatingPercentage: r.heatingPct, coolingPercentage: r.coolingPct,
      airInfiltration: r.airInfiltration,
      wersWindowId: r.windowId, certified: true, certificationRef: r.windowId, published: true,
    });
  }
  return [...byFrame.values()];
}

// product → thermalProfile reference patches (hardware twins share, D5).
export function buildProductRefs() {
  const patches = [];
  for (const [frame, products] of Object.entries(FRAME_TO_PRODUCTS)) {
    for (const slug of products) patches.push({ productSlug: slug, thermalProfileRef: `thermal-${slugify(frame)}` });
  }
  return patches;
}

// ── Validate (M6 gate — run post-import, block on failure) ────────────────────
// TODO(M6): 1 dot-free/unique glazing ids + class∈enum; 2 every row.glazing ref
// resolves; 3 ranges Uw[0.5,10]/SHGC[0,1]/Tvw[0,1]/stars[0,10]; 4 certified⇒ref;
// 5 each mapped product readiness == ready; 6 imported row count == mapped WERS
// rows; 7 no glazing slug collides with an unrelated option/D1 pricing id.

// ── Main (skeleton) ───────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: node import-wers.mjs <unzipped-wers-dir> [--write]"); process.exit(1); }
  const rows = parseWers(dir);
  const glazings = buildGlazingDocs(rows);
  const profiles = buildThermalProfiles(rows);
  const refs = buildProductRefs();
  console.log(`parsed ${rows.length} rows → ${glazings.length} glazing docs, ${profiles.length} profiles, ${refs.length} product refs`);
  console.log(`Fixed Window family + ${NEW_FIXED_PRODUCTS.length} products to create (D3); ${UNMAPPED_FRAMES.length} frames left unmapped.`);
  void NEW_FAMILY;
  // TODO(M6): if (process.argv.includes("--write")) { mutate/import glazings, profiles, NEW_FAMILY,
  //   NEW_FIXED_PRODUCTS, product refs; seed D1 default glass $/m² from pricing-defaults; then validate(). }
  console.log("SCAFFOLD: no writes performed. Implement the --write step (M6).");
}
