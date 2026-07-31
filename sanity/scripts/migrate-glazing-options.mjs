// SCAFFOLD — WS1: migrate glazing from performanceVariant into a first-class,
// shared, MANDATORY glass option, keeping the (frame×glass)→Uw matrix on the product.
//
//   npx sanity exec scripts/migrate-glazing-options.mjs --with-user-token          (dry run)
//   npx sanity exec scripts/migrate-glazing-options.mjs --with-user-token -- --write
//
// Achieves (plan §3, WS1):
//   1. Create an optionType "glazing" (marked REQUIRED — exactly one per line,
//      unlike the optional Flyscreen/Colour types).
//   2. From the distinct performanceVariant.glassBuildUp values across the
//      catalogue, create the shared glass `option` set (choice + base surcharge).
//   3. Link every existing performanceVariant → its glass option
//      (performanceVariant.glazingOption reference) so the variant becomes the
//      (this-frame × this-glass) → Uw/SHGC/price cell.
//   4. Attach a REQUIRED glazing productOption to every product; set each
//      product's default glass = its standard variant's glass option.
//
// Idempotent + dry-run-first (mirrors prefill-seo.mjs). No document is mutated
// without --write, and re-running only fills gaps.
//
// STATUS: scaffold — the steps below are TODO. The schema fields they target
// (optionType 'glazing', performanceVariant.glazingOption) are added in
// sanity/schemaTypes.ts in the same workstream.
import { getCliClient } from "sanity/cli";

const client = getCliClient({ apiVersion: "2024-01-01" });
const WRITE = process.argv.includes("--write");

async function main() {
  // TODO(WS1.1): ensure optionType 'glazing' exists (required=true).
  // TODO(WS1.2): collect distinct glassBuildUp → create/lookup glass options.
  // TODO(WS1.3): patch each product's performanceVariants[].glazingOption ref.
  // TODO(WS1.4): add required glazing productOption + default glass per product.
  // TODO: print a per-product plan in dry-run; apply as a transaction under --write.
  throw new Error(`SCAFFOLD WS1: migrate-glazing-options not implemented (write=${WRITE}, client=${!!client})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
