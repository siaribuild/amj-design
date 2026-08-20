// The recommendation CONTRACT and the deletions that came with it
// (docs/specs/recommendation-model-design.md §3, §14). This suite guards the
// shape ops2 R3 reads and the promises that shape makes: no presentational
// imports (AC-23), no prose (AC-21), no resurrected weights (AC-4), and a
// migration story that only ever adds columns (AC-24/AC-58 static halves).
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const runDir = await makeRunDir("recommendation-contract");

// ADR 0006's admission rule, executed: the shared core carries facts about a
// line, never a way of showing them. An import of a router, a component kit, a
// stylesheet, a store or a fetch client would make the contract un-shareable.
const FORBIDDEN = [
  /^react-router/, /^@ionic\//, /^@radix-ui\//, /^lucide-react$/, /^react$/, /^react-dom/,
  /^@mui\//, /^@emotion\//, /\.css$/, /^sonner$/, /^motion$/, /^recharts$/,
  /\/store\//, /\/api-client/, /\/fetch/,
];

/** Every module the given entry points pull in, as import specifiers. */
async function importGraph(entries) {
  const result = await build({
    entryPoints: entries.map((e) => join(projectRoot, e)),
    bundle: true, write: false, format: "esm", platform: "neutral",
    metafile: true, logLevel: "silent",
    outdir: join(runDir, "graph"),
  });
  return Object.values(result.metafile.inputs)
    .flatMap((input) => input.imports.map((i) => i.path.replace(/\\/g, "/")));
}

// AC-4 / Definition of done. The ten unsourced constants are DELETED, not
// tuned: six weights, two thermal spans, the compliance floor and the 0.05
// dominance threshold. This is a source scan rather than an import check
// because the point is that they exist nowhere at all — a re-tuned copy under
// another name would satisfy every behavioural test in the suite.
const BANNED = [
  "RANK_WEIGHTS", "geometryScore", "configurationScore", "dataCompletenessScore",
  "selectWithConfidence", "gradedComplianceScore", "SHGC_SPAN", "UVALUE_SPAN",
  "variantAffinityScore", "scoreComposite", "technologyAgreement", "compositeCompliance",
  "RANKER_VERSION", "buildHistoricalModel", "aggregateHistorical",
];

async function sourceFiles(dir) {
  const out = [];
  for (const entry of await readdir(join(projectRoot, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test("AC-4 the deleted ranker leaves no symbol behind in worker/ or src/", async () => {
  const files = [...await sourceFiles("worker"), ...await sourceFiles("src")];
  const offenders = [];
  let toleranceDefinitions = 0;
  for (const rel of files) {
    const text = await readFile(join(projectRoot, rel), "utf8");
    // Comments are where a deletion gets EXPLAINED, and an explanation naming
    // what it removed is the opposite of a resurrection. Only live code counts.
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    for (const symbol of BANNED) {
      if (new RegExp(`\\b${symbol}\\b`).test(code)) offenders.push(`${rel}: ${symbol}`);
    }
    // …and the one constant that survives is defined exactly once.
    toleranceDefinitions += (code.match(/(const|let|var)\s+REQUIREMENT_TOLERANCE\b/g) ?? []).length;
  }
  assert.deepEqual(offenders, [], "a deleted constant came back");
  assert.equal(toleranceDefinitions, 1, "REQUIREMENT_TOLERANCE is defined in exactly one module");
});

test("AC-23 the shared contract and the ladder import nothing presentational", async () => {
  const imports = await importGraph([
    "src/data/recommendation.ts",
    "worker/lib/estimator/ladder.ts",
    "worker/lib/estimator/outcome.ts",
  ]);
  for (const spec of imports) {
    for (const banned of FORBIDDEN) {
      assert.ok(!banned.test(spec), `${spec} is not admissible in the shared core (ADR 0006)`);
    }
  }
});

// The static half of AC-24 / AC-58. The runtime half (PRAGMA table_info after a
// real apply, and the FK still pointing where it did) lives in api.test.mjs;
// this catches the dangerous SHAPE before anything is ever applied, because a
// table rebuild is only obviously wrong until someone writes one.
test("AC-24 the recommendation migrations add columns and rebuild nothing", async () => {
  const files = (await readdir(join(projectRoot, "migrations")))
    .filter((f) => /^005[5-9]|^00[6-9]\d/.test(f) && f.endsWith(".sql"));
  assert.ok(files.some((f) => f.includes("recommendation_outcome_columns")), "0055 exists");

  for (const file of files) {
    const sql = (await readFile(join(projectRoot, "migrations", file), "utf8"))
      .split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
    assert.ok(!/\bDROP\s+TABLE\b/i.test(sql), `${file} drops a table`);
    assert.ok(!/CREATE\s+TABLE[\s\S]{0,80}_new\b/i.test(sql), `${file} uses the rebuild recipe`);
    assert.ok(!/\bALTER\s+TABLE\b[\s\S]{0,60}\bRENAME\b/i.test(sql), `${file} renames a table`);
    // candidate_result is referenced by draft_order_line.selected_candidate_id
    // ON DELETE SET NULL; a rebuild would sever every draft line from the
    // candidate it was built from without erroring.
    assert.ok(!/\bDELETE\s+FROM\s+candidate_result\b/i.test(sql), `${file} deletes candidate rows`);
  }
});

// ── AC-21 / AC-54: facts, never sentences — and never the customer's text ────
//
// The rules engine speaks prose ("size 1200×1400 outside 400–1000 mm — composite/
// custom unit, indicative price") and the opening it is handed carries whatever
// the customer's schedule said. The builder rebuilds every exclusion from
// structured fields precisely so neither can ride into a persisted column: a
// reason string copied "just for context" is how a client's name and site
// address end up in a cross-account queryable index.
const outfile = join(runDir, "engine.mjs");
await build({
  stdin: {
    contents: `
      export { selectForOpening } from ${JSON.stringify(join(projectRoot, "worker/lib/estimator/select.ts"))};
      export { toCandidate, fixtureCatalogueRepository } from ${JSON.stringify(join(projectRoot, "worker/lib/estimator/catalogue.ts"))};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { selectForOpening, fixtureCatalogueRepository } = await import(pathToFileURL(outfile).href);

const HOSTILE = "Mrs J. Whitmore, 14 Ellerslie Road Hawthorn VIC 3122 — match existing, see attached";

const variant = (over = {}) => ({
  variantId: "std", glazingOptionSlug: "double-clear", glazingClass: "double_clear",
  uValue: 3.9, shgc: 0.62, frameType: "aluminium", dataSource: "estimated",
  certified: false, published: true, ...over,
});
const fixtureProduct = (over = {}) => ({
  sanityProductId: "id-awn", catalogueRevision: "rev-1", schemaVersion: 1,
  name: "AMJ80 Awning", slug: "amj80-awning",
  family: "windows", series: "awning-window", seriesOperation: "awning",
  category: { slug: { current: "windows" } },
  dimensionRule: { minWidthMm: 400, maxWidthMm: 1000, minHeightMm: 400, maxHeightMm: 2400, maxAreaM2: 2.4, maxAspectRatio: 4, ruleVersion: "v1" },
  performanceVariants: [variant()], optionGroups: [], pricingRef: "amj80", ...over,
});

/** Every string anywhere in the emitted contract, however deeply nested. */
function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) { out.push(k); strings(v, out); }
  }
  return out;
}

test("AC-21/AC-54 the emitted contract carries no prose and no customer document text", async () => {
  const repo = fixtureCatalogueRepository([
    fixtureProduct(),
    // A second product that will be excluded on the glazing instruction, so the
    // hostile opening actually produces exclusion detail to inspect.
    fixtureProduct({
      sanityProductId: "id-single", slug: "amj80-single",
      performanceVariants: [variant({ variantId: "sgl", glazingOptionSlug: "single-clear", glazingClass: "single_clear", uValue: 5.6 })],
    }),
  ]);
  const result = await selectForOpening({
    family: "windows", operationType: "awning", widthMm: 1400, heightMm: 1200,
    externalRef: "W01",
    requirements: { maxUValue: 2.0 },
    scheduleRequirements: { doubleGlazed: true, glassDescription: HOSTILE, colour: HOSTILE },
    thermalContext: { requirementBasis: "plan_derived", technicalReviewReasons: [HOSTILE] },
  }, repo, async () => ({ ok: true, total: 900, unit: 900 }));

  const emitted = [
    ...result.evaluated.map((e) => e.candidateOutcome),
    result.selection,
  ];
  assert.ok(emitted.length > 2, "there is something to inspect");

  for (const value of strings(emitted)) {
    // No substring of the customer's own text, in any field or key.
    for (const word of ["Whitmore", "Ellerslie", "Hawthorn", "attached", "3122"]) {
      assert.ok(!value.includes(word), `customer document text reached the contract: ${value}`);
    }
    // And no assembled copy: every string is an identifier, a slug or an enum.
    assert.ok(!/\s/.test(value) || /^[A-Za-z0-9 _-]{0,40}$/.test(value),
      `an assembled sentence reached the contract: ${value}`);
    assert.ok(!/[—–…]|confirm at review|indicative price/i.test(value),
      `rules prose reached the contract: ${value}`);
  }

  // The exclusion is still USEFUL — it says what was required and what was
  // offered, in facts a surface can word however it likes.
  const excluded = result.evaluated.find((e) => e.candidateOutcome.tier === "excluded");
  assert.ok(excluded, "the single-glazed product is excluded");
  const glazing = excluded.candidateOutcome.exclusions.find((x) => x.constraint === "glazing_instruction");
  assert.deepEqual(glazing.detail, {
    required: { doubleGlazed: true, lowE: false },
    offeredClasses: ["single_clear"],
  });
});

test("A17/AC-4 the price delta's sign is fixed, and the tolerance is stamped on the run", async () => {
  // Three products at $700 / $900 / $1,300, all meeting a band nobody misses.
  const priceBy = { "a-mid": 900, "b-cheap": 700, "c-dear": 1300 };
  const repo = fixtureCatalogueRepository(
    Object.keys(priceBy).map((slug) => fixtureProduct({ sanityProductId: `id-${slug}`, slug })),
  );
  const result = await selectForOpening(
    { family: "windows", operationType: "awning", widthMm: 800, heightMm: 1200, externalRef: "W09" },
    repo, async (c) => ({ ok: true, total: priceBy[c.slug], unit: priceBy[c.slug] }),
  );

  const by = (slug) => result.evaluated.find((e) => e.candidate.slug === slug).candidateOutcome;
  assert.equal(result.selection.selectedProductSlug, "b-cheap");
  // Candidate MINUS pick: 0 on the pick, positive for anything dearer. Nothing
  // here is cheaper than the pick, because the pick is the cheapest that met.
  assert.equal(by("b-cheap").price.deltaToSelected, 0);
  assert.equal(by("a-mid").price.deltaToSelected, 200);
  assert.equal(by("c-dear").price.deltaToSelected, 600);

  // AC-4's stamp half: the run records the tolerance it was decided under, so a
  // past selection stays reproducible after the constant is ever retuned.
  assert.equal(result.selection.tolerance, 0.05);
  assert.equal(result.selection.version, "ladder-v1");
  assert.equal(result.selection.openingRef, "W09");
  assert.deepEqual(result.selection.withheldIncomplete, []);
});

test("AC-58 the corpus reset is a SCOPED delete that cannot cascade", async () => {
  const sql = (await readFile(join(projectRoot, "migrations/0056_learning_retrieval_and_provenance.sql"), "utf8"))
    .split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

  // The reset targets the learning corpus and only the learning corpus.
  // `pending` and `rejected` rows are immutable audit records the platform
  // promised to keep, and a bare DELETE would take them too.
  const deletes = [...sql.matchAll(/DELETE\s+FROM\s+(\w+)([\s\S]*?);/gi)];
  assert.equal(deletes.length, 1, "exactly one delete");
  assert.equal(deletes[0][1], "recommendation_outcome");
  assert.match(deletes[0][2], /WHERE\s+recommendation_eligible\s*=\s*1\s+AND\s+quality_state\s*=\s*'approved'/i);

  // And it cannot cascade, because nothing in the schema references the table.
  // Asserted against the migrations rather than trusted from a comment: a future
  // child table with ON DELETE CASCADE would make this statement destructive
  // somewhere nobody was looking.
  const referencers = [];
  for (const file of await readdir(join(projectRoot, "migrations"))) {
    if (!file.endsWith(".sql")) continue;
    // Comments are where a cascade audit gets WRITTEN DOWN, and a migration
    // that says "grep found no referencers" would otherwise report itself.
    const text = (await readFile(join(projectRoot, "migrations", file), "utf8"))
      .split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
    if (/REFERENCES\s+recommendation_outcome/i.test(text)) referencers.push(file);
  }
  assert.deepEqual(referencers, [], "recommendation_outcome has no child referencers");

  // Provenance defaults, so no surviving row can predate the column unset.
  assert.match(sql, /ADD COLUMN provenance TEXT NOT NULL DEFAULT 'in_platform'/);
  assert.match(sql, /CHECK \(provenance IN \('in_platform','backfilled'\)\)/);
});

// The selection path: every module a candidate passes through on its way to
// being chosen. AC-4's own wording names the ladder, but the Definition of Done
// says "the only tuned constant IN THE SELECTION PATH" — so the guard is scoped
// to the path, not to one file.
const SELECTION_PATH = [
  "worker/lib/estimator/ladder.ts",
  "worker/lib/estimator/select.ts",
  "worker/lib/estimator/outcome.ts",
  "worker/lib/estimator/rules.ts",
  "worker/lib/estimator/compositeRank.ts",
  "worker/lib/estimator/compositeSelect.ts",
  "worker/lib/estimator/splitCandidates.ts",
  "worker/lib/estimator/configuration.ts",
];

test("AC-4 no PREFERENCE constant exists anywhere in the selection path", async () => {
  // A weight and a work cap are not the same animal, and the distinction is the
  // one this whole redesign turns on: a weight says one candidate is BETTER than
  // another, a cap says how much enumeration is enough. The deleted ranker was
  // six weights; `MAX_SYSTEMS` bounds how many frame systems get a hearing and
  // then the ladder decides among all of them equally.
  //
  // The structural tell is the literal itself. A preference weight is a fraction
  // — .35, .20, 0.05 — because it is a share of something. A bound is a count.
  // So: every module-level numeric constant in the selection path must be a
  // whole number, and the one exception is named.
  const offenders = [];
  for (const rel of SELECTION_PATH) {
    const code = (await readFile(join(projectRoot, rel), "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    for (const [, name, literal] of code.matchAll(/^(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/gm)) {
      if (name === "REQUIREMENT_TOLERANCE") continue;
      if (!Number.isInteger(Number(literal))) offenders.push(`${rel}: ${name} = ${literal}`);
    }
  }
  assert.deepEqual(offenders, [], "a fractional constant in the selection path is a weight");
});

test("A18 the one surviving enumeration bound cannot bind, and says why", async () => {
  const code = await readFile(join(projectRoot, "worker/lib/estimator/compositeSelect.ts"), "utf8");
  const capOf = (name) => Number(code.match(new RegExp(`const ${name} = ([0-9]+)`))?.[1]);

  // MAX_SYSTEMS must stay ABOVE the number of frame systems the catalogue has.
  // Its own history is the argument: at 4 it permanently excluded sys-80, the
  // largest platform in the catalogue, because the best-first ordering it relies
  // on collapses to a slug tiebreak on an all-fixed composite and "8" sorts
  // after "1", "6" and "7". A bound has to bound runaway work, not act as a
  // lexical filter on which frames get a hearing.
  assert.ok(capOf("MAX_SYSTEMS") >= 12, "the cap must exceed the catalogue's system count");

  // MAX_GLASS_TRIALS is GONE (owner ruling A18/AD35). It was defended as a bound
  // on work and it was not one: on four or more units suggesting four or more
  // distinct glazing options it truncated the shortlist and dropped a candidate
  // unified make-up that could have been cheaper. Asserted absent, because
  // "we removed it" and "nobody reintroduces it" are different promises.
  assert.equal(code.match(/MAX_GLASS_TRIALS\s*=/), null, "the glass-trial cap must not come back");
  // Exactly ONE enumeration is truncated by a constant, and it is the systems
  // list. MAX_SYSTEMS is allowed to slice because it is guarded above to sit
  // above the catalogue's system count, so it never actually cuts anything;
  // the glass trials have no such guarantee available, which is why the answer
  // there was removal rather than a bigger number.
  assert.deepEqual(
    [...code.matchAll(/\.slice\(0,\s*(MAX_[A-Z_]+)\)/g)].map((m) => m[1]),
    ["MAX_SYSTEMS"],
  );

  // And what survives is documented with WHY, so the next person to tighten it
  // knows what breaks. A bare number here is how the six weights happened.
  const preamble = code.slice(Math.max(0, code.indexOf("const MAX_SYSTEMS") - 1200), code.indexOf("const MAX_SYSTEMS"));
  assert.match(preamble, /\/\*\*|\/\//, "MAX_SYSTEMS carries no reasoning");
  assert.ok(/bound|cap|budget|work|runaway|enumerat/i.test(preamble),
    "MAX_SYSTEMS's comment does not say it bounds WORK rather than expressing a preference");
});
