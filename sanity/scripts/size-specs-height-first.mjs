// Restate every product's size spec HEIGHT FIRST, the joinery trade's order.
//
// The app now prints every dimension as height × width (`sizePhrase` in
// src/data/configurator.ts). The product pages did not follow, because their
// "Minimum size" / "Maximum size" rows are editor-authored content: a bare
// "1500 × 3000 mm" with nothing to say which number is which. A catalogue that
// reads width-first beside a quote that reads height-first is worse than either
// convention on its own.
//
// NOTHING IS GUESSED. A row is only rewritten when its two numbers match the
// product's own dimensionRule in width-then-height order — so the script has
// proof of what it is looking at before it touches it. A row that does not match
// (a typo, a hand-edited value, a size already swapped) is REPORTED and left
// alone. That also makes the script idempotent: once a value is height-first it
// no longer matches the width-first check, so a second run changes nothing.
//
//   npx sanity exec scripts/size-specs-height-first.mjs --with-user-token          (dry run)
//   npx sanity exec scripts/size-specs-height-first.mjs --with-user-token -- --write
import { getCliClient } from "sanity/cli";

const client = getCliClient({ apiVersion: "2024-01-01" });
const WRITE = process.argv.includes("--write");

/** "1500 × 3000 mm" → [1500, 3000]; anything else → null. Deliberately strict:
 *  a value this cannot parse exactly is one a human wrote for a reason. */
const parseSize = (value) => {
  const m = /^\s*([\d,]+)\s*[×x]\s*([\d,]+)\s*mm\s*$/i.exec(String(value ?? ""));
  if (!m) return null;
  const n = (s) => parseInt(s.replace(/,/g, ""), 10);
  const a = n(m[1]), b = n(m[2]);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
};

const isSizeLabel = (label) => /\bsizes?\b/i.test(String(label ?? ""));
/** Which bound the row states — min or max — from its own label. */
const boundOf = (label) => (/\bmin/i.test(String(label ?? "")) ? "min" : "max");

async function main() {
  console.log(WRITE ? "── WRITING ──" : "── DRY RUN (pass -- --write to apply) ──");

  const products = await client.fetch(
    `*[_type=="product"]{ _id, "slug": slug.current, name, dimensionRule, keySpecs, specs }`,
  );

  const patches = [];
  const skipped = [];
  for (const product of products) {
    const rule = product.dimensionRule ?? {};
    const next = {};
    for (const field of ["keySpecs", "specs"]) {
      const rows = Array.isArray(product[field]) ? product[field] : [];
      let touched = false;
      const rewritten = rows.map((row) => {
        if (!isSizeLabel(row?.label)) return row;
        const size = parseSize(row?.value);
        if (!size) { skipped.push(`${product.slug} ${field}/${row?.label}: unparseable "${row?.value}"`); return row; }
        const [a, b] = size;
        // A square size reads the same either way round. It matches the
        // width-first check forever, so without this the script reports work it
        // will never finish and rewrites an identical value on every run.
        if (a === b) return row;
        const bound = boundOf(row.label);
        const w = bound === "min" ? rule.minWidthMm : rule.maxWidthMm;
        const h = bound === "min" ? rule.minHeightMm : rule.maxHeightMm;
        // THE PROOF. Only a row that matches the rule width-then-height is known
        // to be width-first, and only that row is safe to reverse.
        if (a !== w || b !== h) {
          skipped.push(`${product.slug} ${field}/${row.label}: "${row.value}" does not match its ${bound} rule (${w ?? "?"} × ${h ?? "?"}) — left alone`);
          return row;
        }
        touched = true;
        return { ...row, value: `${b.toLocaleString("en-AU")} × ${a.toLocaleString("en-AU")} mm` };
      });
      if (touched) next[field] = rewritten;
    }
    if (Object.keys(next).length) patches.push({ id: product._id, slug: product.slug, next });
  }

  console.log(`\n${products.length} products; ${patches.length} with a width-first size row to reverse.`);
  for (const p of patches) {
    for (const field of Object.keys(p.next)) {
      for (const row of p.next[field]) {
        if (isSizeLabel(row?.label)) console.log(`   ${p.slug.padEnd(42)} ${field}/${row.label} → ${row.value}`);
      }
    }
  }

  if (WRITE && patches.length) {
    let tx = client.transaction();
    for (const p of patches) tx = tx.patch(p.id, (patch) => patch.set(p.next));
    // Sync, so a re-run reads what this one wrote rather than a stale index.
    await tx.commit({ visibility: "sync" });
  }

  if (skipped.length) {
    console.log(`\n── LEFT ALONE (${skipped.length}) — each needs a human, none was guessed at ──`);
    for (const s of skipped) console.log(`   ? ${s}`);
  }
  if (!WRITE) console.log("\nNothing was written. Re-run with `-- --write`.");
}

main().catch((error) => { console.error(error); process.exit(1); });
