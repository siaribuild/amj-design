// The recommendation CONTRACT and the deletions that came with it
// (docs/specs/recommendation-model-design.md §3, §14). This suite guards the
// shape ops2 R3 reads and the promises that shape makes: no presentational
// imports (AC-23), no prose (AC-21), no resurrected weights (AC-4), and a
// migration story that only ever adds columns (AC-24/AC-58 static halves).
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
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
