// Phase 1 of ops2 "Why this product": the `certified` / variant `dataSource`
// flag is removed from the estimator, the Studio schema and the candidate
// contract (spec CERT-AC-1..9, design §4.1, ADR 0011).
//
// The flag was dead vocabulary with live consequences: `sanity/schemaTypes.ts`
// gave the same field opposite initial values on the two authoring paths, so 13
// of 32 products had every thermally-constrained line downgraded to an
// indicative estimate while the other 19 did not. `certificationRef` and
// `wersWindowId` STAY — a WERS reference is a real fact about a product, it is
// simply not a gate.
//
// End-to-end selection behaviour lives in estimator-recommendation.test.mjs;
// the rules engine in estimator-rules.test.mjs. This suite owns the REMOVAL:
// the behaviour that must change, the behaviour that must not, and the
// source-level proof that no call site survived.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { execFile } from "node:child_process";
import { readFile, readdir, writeFile, utimes, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("certified-removal");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { toCandidate } from ${p("worker/lib/estimator/catalogue.ts")};
      export { checkHardRules } from ${p("worker/lib/estimator/rules.ts")};
      export { selectForOpening } from ${p("worker/lib/estimator/select.ts")};
      export { SELECTION_VERSION } from ${p("worker/lib/estimator/ladder.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { toCandidate, checkHardRules, selectForOpening, SELECTION_VERSION } =
  await import(pathToFileURL(outfile).href);

// ── Fixtures: a LEGACY product (performanceVariants only, no thermalProfile),
// which is the half of the catalogue the flag was punishing ─────────────────
const legacyVariant = (variantId, uValue, shgc, over = {}) => ({
  variantId, glazingOptionSlug: variantId, glazingClass: "double_lowe",
  uValue, shgc, frameType: "aluminium", frameTechnology: "conventional",
  certificationRef: null, pricingOptionSlugs: [], published: true, ...over,
});

const legacyProduct = (slug, variants, over = {}) => ({
  sanityProductId: `id-${slug}`, catalogueRevision: "rev1", schemaVersion: 1,
  name: slug, slug, family: "windows", series: "awning-window",
  seriesOperation: "awning",
  configuration: { operationTypes: ["awning"] },
  dimensionRule: {
    minWidthMm: 400, maxWidthMm: 1300, minHeightMm: 400, maxHeightMm: 2400,
    maxAreaM2: null, maxAspectRatio: null, ruleVersion: "v1",
  },
  performanceVariants: variants,
  optionGroups: [], pricingRef: `price.${slug}`, ...over,
});

const priceFn = async () => ({
  ok: true, unit: 500, total: 500, depositAmount: 250, currency: "AUD",
  rateCardId: "r", rateCardVersion: "v1", pricingPolicyVersion: "v1",
  depositPercent: 50, discountPercent: 0,
});
const repoOf = (rows) => ({
  async queryCandidates() { return rows; },
  catalogueVersion() { return "cat-v1"; },
});
const opening = (over = {}) => ({
  family: "windows", operationType: "awning", widthMm: 1000, heightMm: 1200, ...over,
});

// ── CERT-AC-1: a legacy, uncertified product is no longer downgraded ────────
test("CERT-AC-1 a legacy variant with no certification meets a thermal requirement and the line is READY", async () => {
  // Uw 1.6 against a 2.0 cap: it MEETS. Before this phase the line was still
  // stamped commercial_only_estimate, purely because `certified` was absent.
  const rows = [legacyProduct("amj-legacy", [
    legacyVariant("dg-lowe", 1.6, 0.40),
    legacyVariant("single", 5.4, 0.62),
  ])];
  const r = await selectForOpening(opening({ requirements: { maxUValue: 2.0 } }), repoOf(rows), priceFn);
  assert.ok(r.selected, "a product is selected");
  assert.equal(r.selected.selectedVariant.variantId, "dg-lowe", "ranked on its Uw/SHGC figures alone");
  assert.equal(r.status, "ready", "no certification-caused downgrade survives");
  assert.equal(r.selected.outcome.status, "ready");
});

// ── CERT-AC-2: the drop-guard at catalogue.ts:187 is gone ───────────────────
test("CERT-AC-2 a legacy variant that the drop-guard removed outright is now a candidate", () => {
  // The guard was: certified === true && (!certificationRef || dataSource !== 'certified')
  // ⇒ drop the variant from the catalogue entirely.
  const c = toCandidate(legacyProduct("amj-guard", [
    legacyVariant("dg-lowe", 1.6, 0.40, { certified: true, dataSource: "estimated", certificationRef: null }),
  ]));
  assert.ok(c, "the product maps");
  assert.deepEqual(c.performanceVariants.map((v) => v.variantId), ["dg-lowe"]);
});

test("CERT-AC-2 the non-certification guards still drop what they always dropped", () => {
  const c = toCandidate(legacyProduct("amj-guards", [
    legacyVariant("", 1.6, 0.40),                    // no variant id
    legacyVariant("dupe", 1.6, 0.40),
    legacyVariant("dupe", 1.7, 0.41),                // duplicate id
    legacyVariant("wild", 42, 9),                    // figures out of range → nulled, kept
  ]));
  assert.deepEqual(c.performanceVariants.map((v) => v.variantId), ["dupe", "wild"]);
  const wild = c.performanceVariants.find((v) => v.variantId === "wild");
  assert.equal(wild.uValue, null);
  assert.equal(wild.shgc, null);
});

// ── CERT-AC-5: every OTHER downgrade cause is untouched ─────────────────────
test("CERT-AC-5 a candidate outside the `meets` tier is still an indicative estimate", async () => {
  const rows = [legacyProduct("amj-miss", [legacyVariant("single", 5.4, 0.62)])];
  const r = await selectForOpening(opening({ requirements: { maxUValue: 2.0 } }), repoOf(rows), priceFn);
  assert.ok(r.selected, "non-blocking: a product is still assigned");
  assert.equal(r.status, "commercial_only_estimate", "downgraded for MISSING the band, not for certification");
});

test("CERT-AC-5 a rules warning still downgrades the line", () => {
  const c = toCandidate(legacyProduct("amj-warn", [legacyVariant("dg-lowe", 1.6, 0.40)]));
  // Wider than the dimension rule allows ⇒ warning severity ⇒ indicative only.
  const r = checkHardRules({ family: "window", operationType: "awning", widthMm: 4000, heightMm: 1200, requirements: { maxUValue: 2.0 } }, c);
  assert.equal(r.status, "commercial_only_estimate");
  assert.equal(r.passed, true);
});

test("CERT-AC-5 an unconstrained line off a legacy product reads READY", () => {
  const c = toCandidate(legacyProduct("amj-plain", [legacyVariant("dg-lowe", 1.6, 0.40)]));
  const r = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200 }, c);
  assert.equal(r.status, "ready");
});

// ── CERT-AC-3: no call site survives ────────────────────────────────────────
const STRIP = join(projectRoot, "sanity/scripts/strip-certified.mjs");

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// The scan predicate is the STRIP SCRIPT'S OWN, imported rather than re-written
// here (design §2.6 / §4.1 rev 4). The script refuses to write when its checkout
// can still re-populate the field, and this test refuses to pass when the same
// is true — one implementation, so the gate and the criterion cannot drift into
// disagreeing about what a re-population looks like.
const { findCertifiedWrites } = await import(pathToFileURL(STRIP).href);

// Scope is now ALL live source, not three named paths: an importer that
// re-stamps the field is as much a call site as a reader of it.
const SCAN_ROOTS = ["worker", "src", "scripts", "sanity"];

// Three entries, each with its reason. Do not widen this.
const SCAN_ALLOWED = [
  // CERT-AC-9's pre-change fixture, and this scan's own patterns.
  /^scripts\/tests\//,
  // Must name the fields it deletes, and owns the predicate above.
  /^sanity\/scripts\/strip-certified\.mjs$/,
  // `OpsThermalProposed.source` types an INSERT-only historical audit record: a
  // reader of ladder-v1-era stored values (R18), which writes nothing.
  /^src\/ops\/api\.ts$/,
];

async function liveSourceFiles() {
  const out = [];
  for (const root of SCAN_ROOTS) {
    for (const rel of await tsFilesUnderAny(root, /\.(ts|tsx|mjs|js)$/)) {
      if (!SCAN_ALLOWED.some((re) => re.test(rel))) out.push(rel);
    }
  }
  return out;
}

test("CERT-AC-3 the scan predicate itself still works (non-vacuity)", () => {
  // A scan that silently stops matching reports success over an empty set. So
  // the predicate is exercised against known-bad source before it is trusted to
  // report a clean tree, and against the two live senses that must SURVIVE.
  const caught = findCertifiedWrites([
    "const isCertified = (v) => !!v;",
    "const x = { energyCertified: true };",
    "  wersWindowId: r.windowId, certified: true, certificationRef: r.windowId,",
    "const variants = performanceVariants[]{",
    '  variantId, uValue, shgc, dataSource, certified, published',
    "};",
  ].join("\n"));
  assert.ok(caught.some((l) => /isCertified/.test(l)), "isCertified is caught");
  assert.ok(caught.some((l) => /energyCertified/.test(l)), "energyCertified is caught");
  assert.ok(caught.some((l) => /wersWindowId/.test(l)), "a certified field write is caught");
  assert.ok(caught.some((l) => /variantId/.test(l)), "a variant dataSource projection is caught");

  // The two senses that are a DIFFERENT concept and must not be swept in:
  // dimension-rule / configuration provenance.
  assert.deepEqual(findCertifiedWrites([
    "  dimensionRule: {",
    "    ruleVersion: string | null;",
    "    dataSource?: string;",
    "  } | null;",
  ].join("\n")), [], "dimension-rule provenance survives");
  assert.deepEqual(findCertifiedWrites([
    "export function deriveConfiguration(product) {",
    "  return {",
    '    operationTypes: ops,',
    '    dataSource: "estimated",',
    "  };",
    "}",
  ].join("\n")), [], "configuration provenance survives");
});

test("CERT-AC-3 no live source names the deleted field, anywhere", async () => {
  const files = await liveSourceFiles();

  // The walk must demonstrably have REACHED the two files this phase is about,
  // or a clean result proves only that the walk went nowhere.
  assert.ok(files.includes("worker/lib/estimator/catalogue.ts"), "the walk reached catalogue.ts");
  assert.ok(files.includes("scripts/catalogue/import-wers.mjs"), "the walk reached import-wers.mjs");
  assert.ok(files.length > 100, `the walk reached the tree, not a corner (${files.length} files)`);

  const offenders = [];
  for (const rel of files) {
    for (const line of findCertifiedWrites(await readFile(join(projectRoot, rel), "utf8"))) {
      offenders.push(`${rel}: ${line}`);
    }
  }
  assert.deepEqual(offenders, [], `certification vocabulary survives:\n${offenders.join("\n")}`);
});

test("CERT-AC-3 `certificationRef` and `wersWindowId` are still read and still reach the candidate", async () => {
  const catalogue = await readFile(join(projectRoot, "worker/lib/estimator/catalogue.ts"), "utf8");
  assert.ok(catalogue.includes("certificationRef"), "the GROQ projection still selects certificationRef");
  assert.ok(catalogue.includes("wersWindowId"), "the GROQ projection still selects wersWindowId");

  const legacy = toCandidate(legacyProduct("amj-ref", [
    legacyVariant("dg-lowe", 1.6, 0.40, { certificationRef: "WERS-1" }),
  ]));
  assert.equal(legacy.performanceVariants[0].certificationRef, "WERS-1");

  // The profile path's fallback (certificationRef ?? wersWindowId) survives.
  const profile = toCandidate(legacyProduct("amj-profile", [], {
    thermalProfile: {
      frameTechnology: "thermally_broken",
      rows: [
        { glazingOptionSlug: "dg-lowe", glazingClass: "double_lowe", uValue: 1.6, shgc: 0.4, published: true, wersWindowId: "WERS-9" },
        { glazingOptionSlug: "dg-clear", glazingClass: "double_clear", uValue: 2.8, shgc: 0.55, published: true, certificationRef: "AFRC-2", wersWindowId: "WERS-8" },
      ],
    },
  }));
  assert.deepEqual(
    profile.performanceVariants.map((v) => v.certificationRef),
    ["WERS-9", "AFRC-2"],
    "certificationRef wins, wersWindowId is the fallback",
  );
});

// ── CERT-AC-6: the Studio offers neither control ────────────────────────────
test("CERT-AC-6 the Studio schema offers no Certified boolean and no Data source dropdown", async () => {
  const code = stripComments(await readFile(join(projectRoot, "sanity/schemaTypes.ts"), "utf8"));
  assert.ok(!/name:\s*"certified"/.test(code), "no `certified` field is defined");
  assert.ok(!/name:\s*"dataSource"/.test(code), "no `dataSource` field is defined");
  // The rule that made `certificationRef` mandatory once `certified` was ticked.
  // The FIELD stays (and keeps its title); the coupling is what dies.
  assert.ok(!/requires a certification reference/i.test(code), "the certified-coupled validation rule is gone");
  assert.ok(!/parent\?\.certified/.test(code), "and nothing else reads a parent `certified`");
  assert.ok(/name:\s*"certificationRef"/.test(code), "the WERS/AFRC reference is still editable");
  assert.ok(/name:\s*"wersWindowId"/.test(code), "the WERS window id is still editable");
});

// ── CERT-AC-9: the contract removal, paid for by a version bump (ADR 0011) ──
test("CERT-AC-9 SELECTION_VERSION names a new model", () => {
  assert.equal(SELECTION_VERSION, "ladder-v2");
});

test("CERT-AC-9 an outcome_json written under ladder-v1 still parses, dataSource key and all", async () => {
  // Verbatim shape of a stored candidate outcome from before this change.
  const stored = JSON.stringify({
    sanityProductId: "id-amj-awn", productSlug: "amj-awn", variantId: "dg-lowe",
    form: "single", tier: "meets", rank: 1, selected: true, competing: true,
    exclusions: [],
    requirement: { maxUValue: 2, minShgc: null, maxShgc: null, basis: "energy_report", absent: false },
    thermal: {
      uValue: 1.6, shgc: 0.4,
      deviation: { uValue: 0, minShgc: null, maxShgc: null },
      worstAxis: null, normalisedDeviation: 0, absoluteMiss: null,
      dataSource: "certified",
    },
    fit: { fits: true, widthMm: 1000, heightMm: 1200, limit: null, breached: [] },
    price: { total: 500, currency: "AUD", deltaToSelected: 0 },
    learned: null,
  });
  const parsed = JSON.parse(stored);
  assert.equal(parsed.thermal.uValue, 1.6, "the facts a reader needs are untouched");
  assert.equal(parsed.thermal.dataSource, "certified", "the old key is still THERE in storage");
  assert.equal(parsed.tier, "meets");

  // Nothing renders it: no skin or contract reads a thermal dataSource.
  const skins = [];
  for (const dir of ["src/data", "src/ops2"]) {
    for (const rel of await tsFilesUnderAny(dir)) skins.push(rel);
  }
  const offenders = [];
  for (const rel of skins) {
    const code = stripComments(await readFile(join(projectRoot, rel), "utf8"));
    if (/\bdataSource\b/.test(code)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], "no renderer references the removed field");
});

async function tsFilesUnderAny(dir, match = /\.(ts|tsx)$/) {
  const out = [];
  for (const entry of await readdir(join(projectRoot, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    // Build output and vendored code are not source anyone can re-populate from.
    if (/^(node_modules|dist|\.wrangler|\.vite)$/.test(entry.name)) continue;
    if (entry.isDirectory()) out.push(...await tsFilesUnderAny(rel, match));
    else if (match.test(entry.name)) out.push(rel);
  }
  return out;
}

// ── CERT-AC-8 / X-AC-12: the strip run refuses without a verified export ────
function runNode(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [STRIP, ...args], { cwd: projectRoot }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr });
    });
  });
}

test("CERT-AC-8 the strip run refuses with no --export and writes nothing", async () => {
  const r = await runNode([]);
  assert.notEqual(r.code, 0, "a non-zero exit");
  assert.match(`${r.stdout}${r.stderr}`, /export/i, "and says an export is what is missing");
});

test("CERT-AC-8 the strip run refuses on a missing, empty or stale export", async () => {
  const dir = join(runDir, "exports");
  await mkdir(dir, { recursive: true });

  const missing = await runNode(["--export", join(dir, "nope.tar.gz"), "--apply"]);
  assert.notEqual(missing.code, 0);

  const empty = join(dir, "empty.tar.gz");
  await writeFile(empty, "");
  const emptyRun = await runNode(["--export", empty, "--apply"]);
  assert.notEqual(emptyRun.code, 0);

  const stale = join(dir, "stale.tar.gz");
  await writeFile(stale, "not-really-a-tarball-but-non-empty");
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await utimes(stale, twoDaysAgo, twoDaysAgo);
  const staleRun = await runNode(["--export", stale, "--apply"]);
  assert.notEqual(staleRun.code, 0, "an export older than 24 h is not a verified export");
  assert.match(`${staleRun.stdout}${staleRun.stderr}`, /export/i);
});

test("CERT-AC-8 the gate runs offline, before any Sanity client exists", async () => {
  const r = await runNode(["--apply"]);
  // If the script had reached getCliClient it would have failed on a missing
  // CLI context / token instead of on our own gate.
  assert.doesNotMatch(`${r.stdout}${r.stderr}`, /sanity\/cli|getCliClient|token/i);
});

// ── CERT-AC-12: the strip cannot be undone by the next import ─────────────
//
// The depth-(c) strip exists so the field cannot come back. An importer that
// re-stamps it automatically is worse than the person the owner was guarding
// against, and after CERT-AC-6 it would be writing data the Studio can no
// longer display or validate. Proven behaviourally where the script exposes a
// pure builder, and by the widened source scan everywhere else.

test("CERT-AC-12 the derive builder emits no `certified` and no variant `dataSource`", async () => {
  const { derivePerformanceVariant, deriveEstimatorFields, deriveDimensionRule, deriveConfiguration } =
    await import(pathToFileURL(join(projectRoot, "scripts/catalogue/derive-estimator-fields.mjs")).href);

  const product = {
    name: "AMJ80 Series Awning Window", family: "awning-window", category: "windows",
    standardGlass: "Double glazed Low-E argon",
    minWidth: 400, maxWidth: 1200, minHeight: 400, maxHeight: 2400,
  };

  const variant = derivePerformanceVariant(product);
  assert.ok(typeof variant.uValue === "number", "it still derives the figures that matter");
  assert.ok(!("certified" in variant), "no `certified` key");
  assert.ok(!("dataSource" in variant), "no variant `dataSource` key");

  const all = deriveEstimatorFields(product);
  for (const v of all.performanceVariants ?? []) {
    assert.ok(!("certified" in v) && !("dataSource" in v), "nor on the full patch payload");
  }
  assert.ok(!JSON.stringify(all.performanceVariants).includes("certified"));

  // The DIFFERENT concept survives untouched: a size rule and a configuration
  // still record where they came from.
  assert.equal(deriveDimensionRule(product).dataSource, "estimated");
  assert.equal(deriveConfiguration(product).dataSource, "estimated");
});

test("CERT-AC-12 the strip run refuses from a checkout that can re-populate", async () => {
  const dir = join(runDir, "gate");
  await mkdir(dir, { recursive: true });
  const fresh = join(dir, "export.tar.gz");
  await writeFile(fresh, "non-empty");

  // A valid export is NOT enough: the second gate reads this checkout's own
  // importers, so a strip launched from a stale branch is refused at the point
  // of harm rather than silently undone by the next import.
  const clean = await runNode(["--export", fresh, "--apply", "--check"]);
  assert.equal(clean.code, 0, `the gate passes on this checkout:\n${clean.stdout}${clean.stderr}`);

  const dirty = join(dir, "catalogue");
  await mkdir(dirty, { recursive: true });
  await writeFile(join(dirty, "rogue.mjs"), [
    "export const row = {",
    "  wersWindowId: id, certified: true, certificationRef: id, published: true,",
    "};",
  ].join("\n"));
  const r = await runNode(["--export", fresh, "--apply", "--check", "--catalogue-dir", dirty]);
  assert.notEqual(r.code, 0, "a checkout that still writes the field is refused");
  assert.match(`${r.stdout}${r.stderr}`, /rogue\.mjs/, "and it names the file that would undo the strip");
});

test("CERT-AC-12 the re-population gate runs offline, before any Sanity client exists", async () => {
  const dir = join(runDir, "gate-offline");
  await mkdir(dir, { recursive: true });
  const fresh = join(dir, "export.tar.gz");
  await writeFile(fresh, "non-empty");
  const dirty = join(dir, "catalogue");
  await mkdir(dirty, { recursive: true });
  await writeFile(join(dirty, "rogue.mjs"), "export const v = { dataSource: \"estimated\", certified: false };");

  const r = await runNode(["--export", fresh, "--apply", "--catalogue-dir", dirty]);
  assert.notEqual(r.code, 0);
  assert.doesNotMatch(`${r.stdout}${r.stderr}`, /sanity\/cli|getCliClient|token/i,
    "the refusal costs no client and no network call");
});

test("CERT-AC-12 the gate finds the importers from the directory the operator runs in", async () => {
  // The operator runs this through `npx sanity exec` from sanity/, not from the
  // repo root. The gate fails CLOSED, so a cwd-relative default would refuse
  // every legitimate run — and the obvious fix for a refusal nobody expected is
  // to pass --catalogue-dir at something, which is how a gate gets neutered.
  const dir = join(runDir, "cwd");
  await mkdir(dir, { recursive: true });
  const fresh = join(dir, "export.tar.gz");
  await writeFile(fresh, "non-empty");

  const fromSanity = await new Promise((res) => {
    execFile(process.execPath, [STRIP, "--export", fresh, "--check"],
      { cwd: join(projectRoot, "sanity") },
      (error, stdout, stderr) => res({ code: error ? (error.code ?? 1) : 0, stdout, stderr }));
  });
  assert.equal(fromSanity.code, 0, `${fromSanity.stdout}${fromSanity.stderr}`);
  assert.match(fromSanity.stdout, /catalogue script\(s\) clean/);
  assert.doesNotMatch(fromSanity.stdout + fromSanity.stderr, /does not exist/);
});

// ── CERT-AC-7: the strip must actually reach the documents it claims to ───
//
// Codex found `_type=="frameThermalProfile"` in the profile query. No such type
// is declared: the real one is `thermalProfile`. The run would have passed both
// gates, reported completion and left all 21 profile documents carrying
// `rows[].certified` — a destructive script succeeding while doing nothing,
// wrapped in safety gates that would have made us trust the result.
//
// The typo is not the lesson. Nothing asserted that the queried type EXISTS,
// and nothing made an empty match loud. Both are fixed here.

test("CERT-AC-7 every type the strip targets is declared in the Studio schema", async () => {
  const { STRIP_TARGETS } = await import(pathToFileURL(STRIP).href);
  const schema = await readFile(join(projectRoot, "sanity/schemaTypes.ts"), "utf8");

  const declaredTypes = new Set([...schema.matchAll(/^\s{2}name: "([A-Za-z0-9_]+)",$/gm)].map((m) => m[1]));
  // Non-vacuity: a regex that stopped matching would make every assertion below
  // pass over an empty set.
  assert.ok(declaredTypes.has("product"), "the schema walk found `product`");
  assert.ok(declaredTypes.has("thermalProfile"), "and `thermalProfile`");
  assert.ok(declaredTypes.size >= 10, `the walk found the schema, not a corner (${declaredTypes.size})`);

  assert.ok(STRIP_TARGETS.length >= 2, "both document homes are targeted");
  for (const t of STRIP_TARGETS) {
    assert.ok(declaredTypes.has(t.type), `the strip targets \`${t.type}\`, which no defineType declares`);
    // The array field it patches has to exist too: a right type with a wrong
    // field name fails exactly as silently.
    assert.match(schema, new RegExp(`name: "${t.arrayField}"`), `\`${t.arrayField}\` is a declared field`);
  }
});

test("CERT-AC-7 a target type that matches no document at all is LOUD, not a silent success", async () => {
  const { loadTarget, STRIP_TARGETS } = await import(pathToFileURL(STRIP).href);
  const target = STRIP_TARGETS[0];
  const asked = [];
  const fetchFn = async (query) => { asked.push(query); return /^count\(/.test(query) ? 0 : []; };

  await assert.rejects(
    () => loadTarget(fetchFn, target),
    (e) => /no .*document/i.test(e.message) && e.message.includes(target.type),
    "zero documents OF THE TYPE means the type name is wrong, and the run must say so",
  );
  assert.equal(asked.length, 1, "and it stops at the count — it does not go on to patch nothing");
});

test("CERT-AC-7 a type that exists but carries nothing left to strip is a clean no-op", async () => {
  const { loadTarget, STRIP_TARGETS } = await import(pathToFileURL(STRIP).href);
  // The state after a SUCCESSFUL strip. Re-running must not read as a failure,
  // or the loud-on-empty rule would make the script cry wolf every second run.
  const fetchFn = async (query) => (/^count\(/.test(query) ? 21 : []);
  const out = await loadTarget(fetchFn, STRIP_TARGETS[1]);
  assert.equal(out.total, 21);
  assert.deepEqual(out.docs, []);
});
