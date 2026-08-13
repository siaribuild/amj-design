// M6 — WERS → catalogue importer.
//
// Turns the manufacturer WERS export into: (1) one glazing `option` doc per WERS
// build-up (the customer-selectable glazing choice, with its glass spec/type +
// derived class), (2) one shared `thermalProfile` doc per frame (the glazing ×
// Uw/SHGC/stars matrix), (3) product → profile references, and (4) the Fixed
// Window family + products (D3). Hardware-twin products share one profile (D5).
// EVERY build-up is its own option — no collapsing (owner decision).
//
// Sanity writes go through the mutate API (createOrReplace, idempotent, dot-free
// ids) using the local Sanity CLI token. It also emits a D1 seed for the default
// glass $/m² per build-up (the D6 default tiers below).
//
//   node scripts/catalogue/import-wers.mjs <unzipped-wers-dir> [--write]
//
// Without --write it parses, builds and validates but performs NO writes.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const PROJECT_ID = "xjtrm1ex";
const DATASET = "production";
const GLAZING_OPTION_TYPE = "glazingType";     // optionType _id (slug "glazing")
const WINDOWS_CATEGORY = "category-windows";   // category _id (slug "windows")

// ── Owner-confirmed frame → product slug mapping (D4). One frame may map to
// several products (hardware twins) — they SHARE one profile (D5). ────────────
const FRAME_TO_PRODUCTS = {
  "AMJ80 Awning": ["amj80-series-awning-window"],
  "AMJ100L Awning": ["amj100l-series-awning-window"],
  "AMJ100T Awning Window": ["amj100t-awning-window", "amj100t-series-awning-window"],
  "AMJ80 Sliding Window": ["amj80-series-sliding-window"],
  "AMJ80 Sliding Door": ["amj80-series-sliding-door"],
  "AMJ100L Sliding Door": ["amj100l-series-sliding-door"],
  "AMJ100T Sliding Door": ["amj100t-series-sliding-door"],
  "AMJ100T Casement Door": ["amj100t-series-casement-door"],
  "AMJ80T Hinged Door": ["amj80t-casement-door"],
  "AMJ68 BiFold Door": ["amj68-series-bi-fold-door"],
  "AMJ155T Lift and Slide Door": ["amj150t-lift-sliding-door"],
  "AMJ150T TB Awning Window": ["amj150-series-awning-window"],
  "AMJ83 Double Hung": ["amj100t-series-sashless-double-hung"],
  // Fixed Window — NEW products created here (D3).
  "AMJ100T Fixed Window": ["amj100t-fixed-window"],
  "AMJ80ST Fixed Window": ["amj80st-fixed-window"],
  "AMJ100L Fixed Window": ["amj100l-fixed-window"],
  "AMJ67T Fixed Window": ["amj67t-fixed-window"],
  "AMJ150 Fixed Window": ["amj150-fixed-window"],
};
const FIXED_PRODUCT_SLUGS = new Set(["amj100t-fixed-window", "amj80st-fixed-window", "amj100l-fixed-window", "amj67t-fixed-window", "amj150-fixed-window"]);
// Owner-entered AMJ80ST limits, explicitly approved as the common fixed-window
// range on 2026-08-02. Keep these inline on createOrReplace so a future WERS
// refresh cannot erase the completed catalogue fields.
const FIXED_DIMENSION_RULE = { minWidthMm: 400, maxWidthMm: 3000, minHeightMm: 400, maxHeightMm: 3000 };
const UNMAPPED_FRAMES = ["AMJ100 Awning", "AMJ100LST Awning Window", "AMJ80T TB Awning Window", "AMJ67T Awning Window", "AMJ100T Sliding Window", "AMJ100L Sliding Window", "AMJ100 Sliding Door"];

// ── Derivations ───────────────────────────────────────────────────────────────
const num = (v) => (v == null || v === "" ? null : Number(v));
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const glassTypeKey = (t) => ({ clear: "clear", toned: "toned", "low-e": "low_e" }[String(t).toLowerCase().trim()] ?? "clear");
const specWord = (spec) => ({ SG: "single", DG: "double", TG: "triple" }[spec] ?? "double");
const glazingClass = (spec, type) => `${specWord(spec)}_${glassTypeKey(type)}`;
const frameTech = (frame) => (/\d+T\b|TB|thermal/i.test(frame) ? "thermally_broken" : "conventional");
// Default $/m² by tier (D6), keyed spec:type. THIS MAP IS THE ONLY COPY — the
// worker-side pricing-defaults.ts module it once mirrored was never imported by
// anything and has been deleted; these are seed DEFAULTS overridden per glazing
// slug in D1 once real prices land (M7), never a runtime source of truth.
const DEFAULT_GLASS_SQM = { "SG:clear": 60, "SG:low_e": 90, "SG:toned": 80, "DG:clear": 100, "DG:toned": 120, "DG:low_e": 140, "TG:clear": 160, "TG:low_e": 180 };
// typeKey is ALREADY a key (clear/toned/low_e) — do NOT re-run glassTypeKey.
const defaultGlassSqm = (spec, typeKey) => DEFAULT_GLASS_SQM[`${spec}:${typeKey}`] ?? DEFAULT_GLASS_SQM[`${spec}:clear`] ?? 100;

// ── Parse ─────────────────────────────────────────────────────────────────────
export function parseWers(dir) {
  const ss = readFileSync(join(dir, "xl/sharedStrings.xml"), "utf8");
  const strings = [];
  for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) strings.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("").replace(/&amp;/g, "&"));
  const sheet = readFileSync(join(dir, "xl/worksheets/sheet1.xml"), "utf8");
  const rows = [];
  for (const r of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const c = {};
    for (const m of r[1].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*?t="([^"]*)")?[^>]*>(?:<v>([\s\S]*?)<\/v>)?/g)) { if (m[3] != null) c[m[1]] = m[2] === "s" ? strings[Number(m[3])] : m[3]; }
    rows.push(c);
  }
  return rows.slice(1).map((r) => ({
    windowId: r.A, frame: r.C, spec: r.H, glassType: r.I, glazing: r.J,
    heatingStars: num(r.L), coolingStars: num(r.M), heatingPct: num(r.N), coolingPct: num(r.O),
    uValue: num(r.P), shgc: num(r.Q), tvw: num(r.R), airInfiltration: num(r.S),
  }));
}

// ── Build ─────────────────────────────────────────────────────────────────────
// Unique dot-free glazing slug per distinct build-up name (disambiguate collisions).
function glazingSlugs(rows) {
  const byName = new Map(); const used = new Set();
  for (const r of rows) {
    if (byName.has(r.glazing)) continue;
    let base = `glz-${slugify(r.glazing)}` || "glz"; let s = base; let n = 2;
    while (used.has(s)) s = `${base}-${n++}`;
    used.add(s); byName.set(r.glazing, s);
  }
  return byName; // name -> slug
}

export function build(rows) {
  const slugOf = glazingSlugs(rows);
  // 1. glazing option docs (one per distinct build-up).
  const glazingByName = new Map();
  for (const r of rows) {
    if (glazingByName.has(r.glazing)) continue;
    const slug = slugOf.get(r.glazing);
    glazingByName.set(r.glazing, {
      _id: slug, _type: "option", name: r.glazing,
      slug: { _type: "slug", current: slug },
      optionType: { _type: "reference", _ref: GLAZING_OPTION_TYPE },
      glassSpecification: r.spec, glassType: glassTypeKey(r.glassType),
      technicalValue: glazingClass(r.spec, r.glassType),
    });
  }
  const glazings = [...glazingByName.values()];
  // 2. thermalProfile docs per MAPPED frame.
  const profileByFrame = new Map();
  for (const r of rows) {
    if (!(r.frame in FRAME_TO_PRODUCTS)) continue;
    if (!profileByFrame.has(r.frame)) profileByFrame.set(r.frame, { _id: `thermal-${slugify(r.frame)}`, _type: "thermalProfile", name: r.frame, slug: { _type: "slug", current: slugify(r.frame) }, frameTechnology: frameTech(r.frame), rows: [] });
    const p = profileByFrame.get(r.frame);
    if (p.rows.some((x) => x._key === slugOf.get(r.glazing))) continue; // one row per glazing per frame
    p.rows.push({
      _type: "thermalProfileRow", _key: slugOf.get(r.glazing),
      glazing: { _type: "reference", _ref: slugOf.get(r.glazing) },
      uValue: r.uValue, shgc: r.shgc, tvw: r.tvw,
      heatingStars: r.heatingStars, coolingStars: r.coolingStars,
      heatingPercentage: r.heatingPct, coolingPercentage: r.coolingPct,
      airInfiltration: r.airInfiltration,
      wersWindowId: r.windowId, certified: true, certificationRef: r.windowId, published: true,
    });
  }
  const profiles = [...profileByFrame.values()];
  // 3. Fixed Window family + products (D3).
  const family = { _id: "family-fixed-window", _type: "family", name: "Fixed Window", slug: { _type: "slug", current: "fixed-window" }, category: { _type: "reference", _ref: WINDOWS_CATEGORY }, operation: "fixed", aliases: ["FIXED", "FIXED LITE", "PICTURE", "PICTURE WINDOW"] };
  const fixedProducts = [];
  for (const [frame, products] of Object.entries(FRAME_TO_PRODUCTS)) {
    for (const slug of products) {
      if (!FIXED_PRODUCT_SLUGS.has(slug)) continue;
      fixedProducts.push({
        _id: `product-${slug}`, _type: "product",
        name: frame, slug: { _type: "slug", current: slug },
        family: { _type: "reference", _ref: "family-fixed-window" },
        category: { _type: "reference", _ref: WINDOWS_CATEGORY },
        schemaVersion: 1,
        thermalProfile: { _type: "reference", _ref: `thermal-${slugify(frame)}` },
        dimensionRule: { ...FIXED_DIMENSION_RULE },
        pricingRef: slug,
      });
    }
  }
  // 4. product → profile reference patches (existing products; twins share, D5).
  const refPatches = [];
  for (const [frame, products] of Object.entries(FRAME_TO_PRODUCTS)) {
    for (const slug of products) {
      if (FIXED_PRODUCT_SLUGS.has(slug)) continue; // fixed products carry the ref inline
      refPatches.push({ productSlug: slug, ref: `thermal-${slugify(frame)}` });
    }
  }
  // 5. D1 default glass $/m² seed (per build-up slug), by tier.
  const priceSeed = glazings.map((g) => ({ slug: g._id, sqm: defaultGlassSqm(g.glassSpecification, g.glassType) }));
  return { glazings, profiles, family, fixedProducts, refPatches, priceSeed };
}

// ── Sanity mutate (createOrReplace) ───────────────────────────────────────────
function sanityToken() {
  return JSON.parse(readFileSync(join(homedir(), ".config", "sanity", "config.json"), "utf8")).authToken;
}
async function mutate(mutations) {
  const res = await fetch(`https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/mutate/${DATASET}?returnIds=false`, {
    method: "POST", headers: { Authorization: `Bearer ${sanityToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mutations }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`mutate ${res.status}: ${txt.slice(0, 300)}`);
  return txt;
}
const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

async function write({ glazings, profiles, family, fixedProducts, refPatches }) {
  // Order: glazing options + family first (referenced), then profiles + products, then refs.
  const create = [...glazings, family, ...profiles, ...fixedProducts].map((doc) => ({ createOrReplace: doc }));
  for (const batch of chunk(create, 50)) await mutate(batch);
  const patches = refPatches.map((p) => ({ patch: { query: `*[_type=="product" && slug.current=="${p.productSlug}"]`, set: { thermalProfile: { _type: "reference", _ref: p.ref } } } }));
  for (const batch of chunk(patches, 50)) await mutate(batch);
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: node import-wers.mjs <unzipped-wers-dir> [--write]"); process.exit(1); }
  const rows = parseWers(dir);
  const out = build(rows);
  console.log(`parsed ${rows.length} rows → ${out.glazings.length} glazing options, ${out.profiles.length} profiles (${out.profiles.reduce((n, p) => n + p.rows.length, 0)} rows), ${out.fixedProducts.length} fixed products, ${out.refPatches.length} product refs.`);
  console.log(`unmapped frames (glazing options still imported): ${UNMAPPED_FRAMES.length}`);
  // Emit the D1 default-price seed alongside.
  const sql = out.priceSeed.map((p) => `INSERT INTO pricing_option_surcharge (id, surcharge, basis, version, active) VALUES ('${p.slug}', ${p.sqm}, 'per_sqm', 'v1', 1) ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, basis='per_sqm', active=1;`).join("\n");
  writeFileSync(join(dir, "..", "glazing-default-prices.sql"), sql + "\n");
  console.log(`wrote D1 default-price seed (${out.priceSeed.length} rows) to <wers>/../glazing-default-prices.sql`);
  if (process.argv.includes("--write")) {
    console.log("writing to Sanity…");
    await write(out);
    console.log("done — Sanity updated. Next: apply the D1 price seed + area-rate trim, then deploy.");
  } else {
    console.log("dry run — no writes. Re-run with --write to apply.");
  }
}
