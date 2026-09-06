// Go-live minimum catalogue — applies `AMJ_min.xlsx` (owner, 2026-09-06) to the
// live Sanity catalogue. Working plan and the owner's rulings:
// docs/runs/catalogue-go-live-min/PLAN.md.
//
//   node scripts/catalogue/apply-go-live-min.mjs             dry run: fetch, validate, print the plan
//   node scripts/catalogue/apply-go-live-min.mjs --write     apply
//   node scripts/catalogue/apply-go-live-min.mjs --verify    read back: is every sheet product
//                                                            machine-selectable, is everything else off
//
// What it does, in order — see scripts/catalogue/go-live-plan.mjs's plan() for
// the sheet data and step-by-step logic.
//
// Prices are D1, not Sanity: docs/runs/catalogue-go-live-min/rate-cards.sql.
//
// Writes go through the mutate API with the local Sanity CLI token, the same way
// scripts/catalogue/import-wers.mjs does. Idempotent: a second run finds nothing
// to change.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { plan, assertSafe, P, NEW_PROFILES, normProfile, same } from "./go-live-plan.mjs";

const PROJECT_ID = "xjtrm1ex";
const DATASET = "production";
const API = "v2024-01-01";

// ── token ─────────────────────────────────────────────────────────────────────
export function resolveToken(env = process.env) {
  if (env.SANITY_WRITE_TOKEN) return env.SANITY_WRITE_TOKEN;
  try {
    return JSON.parse(readFileSync(join(homedir(), ".config", "sanity", "config.json"), "utf8")).authToken ?? null;
  } catch {
    return null;
  }
}

// ── Sanity I/O ────────────────────────────────────────────────────────────────
async function query({ fetchImpl, token }, groq, params = {}) {
  const qs = new URLSearchParams({ query: groq });
  for (const [k, v] of Object.entries(params)) qs.set(`$${k}`, JSON.stringify(v));
  const res = await fetchImpl(`https://${PROJECT_ID}.api.sanity.io/${API}/data/query/${DATASET}?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`query ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).result;
}
async function mutate({ fetchImpl, token }, mutations) {
  const res = await fetchImpl(`https://${PROJECT_ID}.api.sanity.io/${API}/data/mutate/${DATASET}?returnIds=false`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mutations }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`mutate ${res.status}: ${txt.slice(0, 300)}`);
  return txt;
}

// ── Plan ──────────────────────────────────────────────────────────────────────
async function loadWorld(io) {
  const [products, refs] = await Promise.all([
    query(io, `*[_type=="product" && !(_id in path("drafts.**"))]{..., "familyName": family->name, "categoryName": category->name}`),
    query(io, `{
      "families": *[_type=="family" && !(_id in path("drafts.**"))]{_id, name},
      "categories": *[_type=="category"]{_id, name},
      "systems": *[_type=="frameSystem"]{_id, "slug": slug.current},
      "profiles": *[_type=="thermalProfile"]{_id, _rev, rows[]{_key, "glazing": glazing._ref, published, uValue, shgc, wersWindowId}},
      "fullProfiles": *[_type=="thermalProfile" && _id in $profileIds]{_id, name, slug, frameTechnology, rows},
      "options": *[_type=="option"]{_id, _rev, name, isDefault, "type": optionType->slug.current}
    }`, { profileIds: NEW_PROFILES.map((p) => p._id) }),
  ]);
  return { products: new Map(products.map((p) => [p.slug.current, p])), ...refs };
}

// ── Verify: what the estimator will see ───────────────────────────────────────
async function runVerify(io, log) {
  const rows = await query(io, `*[_type=="product" && !(_id in path("drafts.**"))]|order(slug.current asc){
    "slug": slug.current, name, disabled, pricingRef,
    "operation": family->operation, "hasDim": defined(dimensionRule.minWidthMm) && defined(dimensionRule.maxHeightMm),
    "system": frameSystem->slug.current, "profile": thermalProfile->slug.current,
    "published": count(thermalProfile->rows[published != false && defined(uValue) && defined(shgc)]),
    "stdHardware": options[availability=="standard" && option->optionType->slug.current=="hardware"][0].option->name,
    "paras": count(descriptionParagraphs)
  }`);
  const sheet = new Set(P.map((p) => p.slug));
  let bad = 0;
  for (const r of rows) {
    const selectable = r.disabled !== true && !!r.operation && r.hasDim && r.published >= 1;
    const want = sheet.has(r.slug);
    const ok = selectable === want && (!want || (r.published === 1 && r.pricingRef === r.slug && r.paras === 3));
    if (!ok) bad++;
    log(`${ok ? "ok " : "BAD"} ${want ? "SHEET" : "off  "} ${r.slug.padEnd(40)} disabled=${r.disabled === true} op=${r.operation} dim=${r.hasDim} rows=${r.published} sys=${r.system} profile=${r.profile} hw=${r.stdHardware ?? "-"}`);
  }
  log(`${rows.length} products, ${rows.filter((r) => sheet.has(r.slug)).length} on the sheet, ${bad} not as intended.`);
  return bad ? 1 : 0;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function run({ write = false, verify = false, fetchImpl = globalThis.fetch, log = console.log, error = console.error, planImpl = plan } = {}) {
  const token = resolveToken();
  if (write && !token) {
    error("no Sanity write token: set SANITY_WRITE_TOKEN or log in with the Sanity CLI (~/.config/sanity/config.json)");
    return 1;
  }
  const io = { fetchImpl, token };
  if (verify) {
    const world = await loadWorld(io);
    const { mutations, problems } = planImpl(world);
    if (problems.length) {
      for (const p of problems) error(`DRIFT: ${p}`);
      return 1;
    }
    const violations = assertSafe(mutations);
    if (violations.length) {
      for (const v of violations) error(`DRIFT: ${v}`);
      return 1;
    }
    for (const m of mutations) {
      if (m.patch) { log(`DRIFT ${m.patch.id}: ${Object.keys(m.patch.set ?? {}).join(", ")}`); continue; }
      const doc = m.createOrReplace ?? m.createIfNotExists;
      const existing = world.fullProfiles?.find((p) => p._id === doc._id);
      if (!existing) { log(`DRIFT ${doc._id}: missing`); continue; }
      const want = normProfile(doc), have = normProfile(existing);
      const changed = Object.keys(want).filter((k) => !same(have[k], want[k]));
      log(`DRIFT ${doc._id}: ${changed.join(", ")}`);
    }
    const sheetCode = await runVerify(io, log);
    return mutations.length ? 1 : sheetCode;
  }

  const world = await loadWorld(io);
  const { mutations, report, problems, summary } = planImpl(world);
  for (const line of report) log("  " + line);
  if (problems.length) {
    error(`${problems.length} problem(s) — nothing written:`);
    for (const p of problems) error("  ✗ " + p);
    return 1;
  }
  const violations = assertSafe(mutations);
  if (violations.length) {
    error(`${violations.length} unsafe mutation(s) — nothing written:`);
    for (const v of violations) error("  ✗ " + v);
    return 1;
  }
  log(`${summary.amend} amend target(s), ${summary.create} create target(s)`);
  if (!write) {
    log("dry run — re-run with --write to apply.");
    return 0;
  }
  await mutate(io, mutations);
  log("written. Run with --verify to read it back.");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await run({ write: process.argv.includes("--write"), verify: process.argv.includes("--verify") });
}
