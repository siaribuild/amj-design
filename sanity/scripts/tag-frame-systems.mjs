// C2 — create the frame systems and tag every product with the one it is built on.
//
// The extrusion platform exists nowhere in this model: `frameTechnology` is
// conventional-vs-thermally-broken, `frameType` is the metal, and the AMJ
// designator survives only inside the product name. Until each product carries a
// system, the estimator cannot tell that the units of one composite opening must
// couple — and since every fixed product shares one 400–3000 dimension rule,
// geometry cannot discriminate either, so the commercial term decides alone and
// the cheapest lite in the catalogue turns up beside whatever frame the opening
// happened to want.
//
// THE GROUPING IS THE OWNER'S, NOT DERIVED (2026-08-08): the number is the
// system, the letters are variants within it. So AMJ80 / AMJ80ST / AMJ80T are one
// system, as are 65T / 67T / 68, 100 / 100L / 100T, and 150 / 150T. A system
// therefore spans conventional AND thermally-broken frames, which is why no
// frameTechnology is written onto the system document — it is a per-product fact
// and a copy here would be free to disagree with the product's own.
//
// NOTHING IS INFERRED FROM A SLUG. The map below is transcribed from the owner's
// answers, and a product missing from it is REPORTED, never guessed — AMJ80 →
// AMJ80ST and AMJ65T → AMJ67T are near-miss pairings only the manufacturer can
// confirm, and a rule that is right nine times and silently wrong twice is worse
// than no rule at all.
//
//   npx sanity exec scripts/tag-frame-systems.mjs --with-user-token          (dry run + audit)
//   npx sanity exec scripts/tag-frame-systems.mjs --with-user-token -- --write
//
// Idempotent: re-running creates nothing that exists and patches nothing already
// correct. Safe to run after adding a product — it will report the new one as
// untagged, which is this script's second job.
//
// Design: docs/product-compatibility-design.md.
import { getCliClient } from "sanity/cli";

const client = getCliClient({ apiVersion: "2024-01-01" });
const WRITE = process.argv.includes("--write");

/** The six systems. `compatibleWith` is deliberately empty on every one: five of
 *  the six make their own fixed lite, and the owner declined the only candidate
 *  edge (sys-125, whose slim-frame door reaches 5000mm and may never be split).
 *  An unauthored edge is a decision the manufacturer has not made. */
const SYSTEMS = [
  { slug: "sys-65", name: "AMJ65", notes: "The 65–68mm band: AMJ65T, AMJ67T and AMJ68. Fixed lite is the AMJ67T." },
  { slug: "sys-72", name: "AMJ72T", notes: "Thermally broken throughout. Makes its own awning and fixed." },
  { slug: "sys-80", name: "AMJ80", notes: "Spans conventional (AMJ80, AMJ80ST) and thermally broken (AMJ80T). Fixed lite is the AMJ80ST." },
  { slug: "sys-100", name: "AMJ100", notes: "Spans AMJ100, AMJ100L (conventional) and AMJ100T (thermally broken). Two fixed lites — the selector picks between them on composite thermal and cost." },
  { slug: "sys-125", name: "AMJ125T", notes: "Slim-frame sliding door only. Makes no fixed lite and names no partner: a composite falls back and is flagged for review." },
  { slug: "sys-150", name: "AMJ150", notes: "Spans AMJ150 (conventional fixed) and AMJ150T. Fixed lite is the AMJ150." },
];

/** product slug → system slug. All 34 published products, transcribed. */
const TAGS = {
  // sys-65
  "amj65t-casement-windowoutward-opening": "sys-65",
  "amj65t-tilt-and-turn-window": "sys-65",
  "amj65t-casement-door": "sys-65",
  "amj67t-fixed-window": "sys-65",
  "amj68-series-bi-fold-door": "sys-65",
  // sys-72
  "amj72t-awning-window": "sys-72",
  "amj72t-fixed-window": "sys-72",
  // sys-80
  "amj80-series-sliding-window": "sys-80",
  "amj80-series-awning-window": "sys-80",
  "amj80-series-casement-window": "sys-80",
  "amj80-series-glass-louver4-inch": "sys-80",
  "amj80-series-sliding-door": "sys-80",
  "amj80st-fixed-window": "sys-80",
  "amj80t-tilt-and-turn-window": "sys-80",
  "amj80t-casement-door": "sys-80",
  "amj80t-bi-fold-door": "sys-80",
  // sys-100
  "amj100-series-pivot-door": "sys-100",
  "amj100l-series-awning-window": "sys-100",
  "amj100l-fixed-window": "sys-100",
  "amj100l-series-glass-louver6-inch": "sys-100",
  "amj100l-series-sliding-door": "sys-100",
  "amj100l-series-casement-door": "sys-100",
  "amj100t-awning-window": "sys-100",
  "amj100t-series-awning-window": "sys-100",
  "amj100t-fixed-window": "sys-100",
  "amj100t-series-sashless-double-hung": "sys-100",
  "amj100t-single-hung-window": "sys-100",
  "amj100t-series-sliding-door": "sys-100",
  "amj100t-series-casement-door": "sys-100",
  // sys-125
  "amj125t-slim-frame-sliding-door": "sys-125",
  // sys-150
  "amj150-series-awning-window": "sys-150",
  "amj150-fixed-window": "sys-150",
  "amj150-series-sliding-door": "sys-150",
  "amj150t-lift-sliding-door": "sys-150",
};

const docId = (systemSlug) => `frameSystem-${systemSlug}`;

async function main() {
  console.log(WRITE ? "── WRITING ──" : "── DRY RUN (pass -- --write to apply) ──");

  // 1. The systems.
  const existing = new Set(
    (await client.fetch(`*[_type=="frameSystem"].slug.current`)).filter(Boolean),
  );
  const toCreate = SYSTEMS.filter((s) => !existing.has(s.slug));
  console.log(`\nSystems: ${SYSTEMS.length} defined, ${existing.size} already present, ${toCreate.length} to create.`);
  if (WRITE && toCreate.length) {
    let tx = client.transaction();
    for (const s of toCreate) {
      tx = tx.createIfNotExists({
        _id: docId(s.slug), _type: "frameSystem",
        name: s.name, slug: { _type: "slug", current: s.slug }, notes: s.notes,
        // Left ABSENT rather than []: an empty array and a missing field mean the
        // same thing to the projection, and not writing one is not authoring one.
      });
    }
    await tx.commit({ visibility: "async" });
  }
  for (const s of toCreate) console.log(`   + ${s.slug} (${s.name})`);

  // 2. The products. Draft and published are patched together — tagging only the
  //    published copy would leave a draft that silently reverts the tag when a
  //    editor next publishes an unrelated change.
  const products = await client.fetch(
    `*[_type=="product"]{ _id, "slug": slug.current, name, "system": frameSystem->slug.current }`,
  );
  const bySlug = new Map();
  for (const p of products) {
    if (!p.slug) continue;
    if (!bySlug.has(p.slug)) bySlug.set(p.slug, []);
    bySlug.get(p.slug).push(p);
  }

  const changes = [];
  const alreadyRight = [];
  const disagreements = [];
  for (const [slug, wanted] of Object.entries(TAGS)) {
    const docs = bySlug.get(slug);
    if (!docs?.length) { disagreements.push(`MISSING PRODUCT  ${slug} — in the map, not in the catalogue`); continue; }
    for (const doc of docs) {
      if (doc.system === wanted) { alreadyRight.push(doc._id); continue; }
      // A product already pointing somewhere ELSE is a human decision this script
      // must not silently overwrite; report it and leave it alone.
      if (doc.system) { disagreements.push(`CONFLICT         ${slug} is ${doc.system}, map says ${wanted} — left alone`); continue; }
      changes.push({ id: doc._id, slug, system: wanted });
    }
  }

  console.log(`\nProducts: ${bySlug.size} in the catalogue, ${Object.keys(TAGS).length} in the map.`);
  console.log(`   already tagged correctly: ${alreadyRight.length}`);
  console.log(`   to tag: ${changes.length}`);
  for (const c of changes) console.log(`   → ${c.slug.padEnd(42)} ${c.system}`);

  if (WRITE && changes.length) {
    let tx = client.transaction();
    for (const c of changes) {
      tx = tx.patch(c.id, (p) => p.set({ frameSystem: { _type: "reference", _ref: docId(c.system) } }));
    }
    // SYNC, because the audit below reads back the very field this writes. With
    // async visibility the query can be served from an index that has not seen
    // the patches yet, and the run reports every system as having no fixed lite
    // — a false alarm on the one output an operator is meant to act on.
    await tx.commit({ visibility: "sync" });
  }

  // 3. THE AUDIT — this script's second job, and the reason to keep running it.
  //    A product with no system is UNKNOWN to the selector, never incompatible,
  //    so nothing breaks; it simply cannot participate in a single-system
  //    composite. Silence about that would read as coverage.
  const untagged = [...bySlug.entries()]
    .filter(([slug]) => !TAGS[slug])
    .map(([slug, docs]) => `${slug} (${docs[0].name ?? "?"})`);

  console.log("\n── AUDIT ──");
  if (disagreements.length) {
    console.log("Needs a human:");
    for (const d of disagreements) console.log(`   ! ${d}`);
  }
  if (untagged.length) {
    console.log(`Untagged products (${untagged.length}) — add them to TAGS above, do not guess in code:`);
    for (const u of untagged) console.log(`   ? ${u}`);
  } else {
    console.log("Every catalogue product is in the map.");
  }

  // Which systems can supply the passive lite a wide opening needs. A system that
  // cannot, and names no partner, will fall back to independent per-segment
  // selection and be flagged for review — a real and accepted outcome, but one
  // nobody should discover from a quote.
  const lites = await client.fetch(
    `*[_type=="product" && family->operation == "fixed"]{ "slug": slug.current, "system": frameSystem->slug.current }`,
  );
  const withLite = new Set(lites.map((l) => l.system).filter(Boolean));
  const wanted = new Set(Object.values(TAGS));
  const noLite = [...wanted].filter((s) => !withLite.has(s)).sort();
  console.log(noLite.length
    ? `Systems with no fixed lite of their own: ${noLite.join(", ")} — a composite on one of these is flagged for review unless an edge is authored.`
    : "Every system makes its own fixed lite.");

  if (!WRITE) console.log("\nNothing was written. Re-run with `-- --write`.");
}

main().catch((error) => { console.error(error); process.exit(1); });
