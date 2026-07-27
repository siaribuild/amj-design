#!/usr/bin/env node
// Reconcile the Sanity option catalogue against D1 pricing.
//
//   node scripts/reconcile-options.mjs            # local D1
//   node scripts/reconcile-options.mjs --remote   # production
//
// D1 owns what an option COSTS; Sanity maps which options a product offers and
// which one is standard. Two stores means they can drift — and they already did:
// pricing_option_surcharge sat EMPTY from migration 0015 until 0027 while Sanity
// accumulated 54 options, and nothing noticed because a client-side fallback
// quietly covered for it.
//
// This is the check that makes that impossible to repeat. Exits non-zero when a
// non-standard option a customer can actually choose has no price in D1.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const remote = process.argv.includes("--remote");
const PROJECT = "xjtrm1ex";
const DATASET = "production";

const canon = (v) => String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Only options actually OFFERED by a product matter: an orphan option document
// nobody can select is untidy, not a pricing fault.
const QUERY = `*[_type=="product"]{ "slug": slug.current, "opts": options[]{ availability, "type": option->optionType->slug.current, "name": option->name } }`;

const res = await fetch(`https://${PROJECT}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(QUERY)}`);
const { result = [] } = await res.json();

const needed = new Map();   // slug -> Set(product)
for (const p of result) {
  for (const o of p?.opts ?? []) {
    if (!o?.type || !o?.name) continue;
    if (o.availability === "standard") continue;      // included in the base rate
    const id = `${canon(o.type)}:${canon(o.name)}`;
    if (!needed.has(id)) needed.set(id, new Set());
    needed.get(id).add(p.slug);
  }
}

// Invoke wrangler's entry directly rather than through a shell: a shell mangles
// the SQL argument's spaces on Windows.
const wrangler = join("node_modules", "wrangler", "bin", "wrangler.js");
const out = execFileSync(process.execPath, [
  wrangler, "d1", "execute", "apertly-db", remote ? "--remote" : "--local",
  "--json", "--command", "SELECT id FROM pricing_option_surcharge WHERE active=1",
], { encoding: "utf8" });
const have = new Set(JSON.parse(out)[0].results.map((r) => r.id));

const missing = [...needed.keys()].filter((id) => !have.has(id)).sort();
const orphaned = [...have].filter((id) => !needed.has(id)).sort();

console.log(`${needed.size} chargeable option(s) offered by products · ${have.size} priced in D1 (${remote ? "remote" : "local"})\n`);

if (orphaned.length) {
  // Not a failure: a priced row nobody offers is harmless, and may be a product
  // about to be published. Worth seeing, not worth blocking on.
  console.log(`· ${orphaned.length} priced in D1 but not offered by any product:`);
  for (const id of orphaned) console.log(`    ${id}`);
  console.log("");
}

if (missing.length) {
  console.error(`✗ ${missing.length} option(s) a customer can choose have NO price in D1:\n`);
  for (const id of missing) console.error(`    ${id}   (${[...needed.get(id)].slice(0, 3).join(", ")}${needed.get(id).size > 3 ? ", …" : ""})`);
  console.error("\nThese lines will refuse to price rather than under-charge.");
  console.error("Fix: add the option in Sanity with its price, then regenerate:");
  console.error("  node scripts/gen-option-surcharges.mjs   (then a new migration)");
  process.exit(1);
}

console.log("✓ every chargeable option a product offers has a price in D1");
