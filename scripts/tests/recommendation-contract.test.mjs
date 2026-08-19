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
  ]);
  for (const spec of imports) {
    for (const banned of FORBIDDEN) {
      assert.ok(!banned.test(spec), `${spec} is not admissible in the shared core (ADR 0006)`);
    }
  }
});
