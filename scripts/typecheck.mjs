#!/usr/bin/env node
// Type-check gate.
//
// `npm run typecheck` reports EVERYTHING tsc finds. `npm test` runs this with
// --fatal-only, which fails the build on the error codes that mean "this cannot
// possibly work at runtime" while the remaining backlog is worked down.
//
// Why a subset rather than all-or-nothing: the project shipped for months with
// no type-checking at all, so a full clean bill is a project, not a commit.
// Gating on nothing until that is finished would leave the exact hole that has
// now produced four production defects — an undefined identifier minifying
// straight into the bundle. Gating on the fatal codes today closes that hole
// immediately and the rest can be tightened one code at a time.
//
// To promote a code: fix its occurrences, move it into FATAL, keep it green.
import { spawnSync } from "node:child_process";
import { join } from "node:path";

// EVERY PARSE ERROR IS FATAL, and the question it answers is "does this file
// parse", not "is this style preferred".
//
// Promoted 2026-08-28 after the gate printed "no fatal type errors" over a file
// that could not be parsed at all: a SQL comment inside a template literal wrote
// a word in backticks and closed the string. esbuild caught it four minutes
// later, as a 300s suite timeout that looked like slowness.
//
// It took two corrections from Codex to get the boundary right, and both are
// worth keeping written down:
//
//   * four listed codes is not the family — `const x = ;` is TS1109, which the
//     list missed, so unbuildable source still passed;
//   * the TS1xxx prefix alone is not the family either. It is over-inclusive
//     (TS1205 and its isolatedModules siblings are a CONFIG rule about
//     re-export syntax — esbuild strips the import and the build succeeds) and
//     under-inclusive (a malformed JSX tag is TS17002, five digits).
//
// So: the syntactic bands, minus the config-driven codes that live inside one.
const ISOLATED_MODULES = new Set([
  "TS1205", // Re-exporting a type requires `export type`
  "TS1203", // Export assignment cannot be used when targeting ES modules
  "TS1284", // Ambient const enum not allowed
  "TS1286", // Ambient const enum
  "TS1287", // A top-level export modifier
  "TS1288", // An export declaration
]);
const isParseError = (code) =>
  (/^TS1\d{3}$/.test(code) || /^TS17\d{3}$/.test(code)) && !ISOLATED_MODULES.has(code);

// Codes that always denote broken code, never a strictness preference.
const FATAL = new Set([
  "TS2304", // Cannot find name — the setRec class: undefined identifier
  "TS2552", // Cannot find name, did you mean …
  "TS2305", // Module has no exported member — a dead or renamed import
  "TS2307", // Cannot find module
  "TS2554", // Wrong number of arguments
  "TS2555", // Expected at least N arguments
  "TS2551", // Property does not exist, did you mean …
  // Added after it let a real one through: `const tabs = tabsFor(product)` sat
  // above `const product = …` in ProductDetailPage and threw on every render,
  // blanking the page in production. tsc reported it; the gate did not, because
  // this code was not listed. A temporal-dead-zone read is never a preference.
  // SYNTAX. Promoted 2026-08-28 after the gate printed "no fatal type errors"
  // over a file that could not be parsed at all: a SQL comment inside a template
  // literal said `product` in backticks, which closed the string. esbuild caught
  // it — four minutes later, as "Expected \")\" but found \"product\"", after a
  // 300s suite timeout that looked like slowness. A file that does not parse is
  // never a strictness preference, which is this set's whole criterion.
  "TS2448", // Block-scoped variable used before its declaration
  "TS2454", // Variable is used before being assigned
  // Promoted after its single occurrence was fixed. estimate.ts passed `offset`
  // into proposeSplit, whose options type did not declare it, and the literal
  // built downstream dropped it — so an OFFSET unit was proposed as a straight
  // half and `offsetOperableRatio` was unreachable from Sanity all the way down.
  // An unknown property on an object literal is never a strictness preference:
  // it means the value the caller is sending is not the value being read.
  "TS2353", // Object literal may only specify known properties
  // Both cleared and promoted together: a missing module declaration and an
  // import path the bundler accepts but tsc does not. Neither is a strictness
  // preference — each is "this import does not resolve" — and four of them
  // sitting in the backlog is four chances to scroll past a real one.
  "TS2882", // Cannot find module/type declarations for a side-effect import
  "TS5097", // An import path can only end with .tsx when allowImportingTsExtensions
]);

const fatalOnly = process.argv.includes("--fatal-only");
const tsc = join("node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
const res = process.platform === "win32"
  ? spawnSync(process.execPath, [join("node_modules", "typescript", "bin", "tsc"), "--noEmit"], { encoding: "utf8" })
  : spawnSync(tsc, ["--noEmit"], { encoding: "utf8" });
const lines = `${res.stdout ?? ""}${res.stderr ?? ""}`.split("\n").filter((l) => /error TS\d+/.test(l));

if (!fatalOnly) {
  for (const l of lines) console.log(l);
  const byCode = {};
  for (const l of lines) { const m = l.match(/error (TS\d+)/); if (m) byCode[m[1]] = (byCode[m[1]] ?? 0) + 1; }
  console.log(`\n${lines.length} error(s)`);
  for (const [code, n] of Object.entries(byCode).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(8)} ${String(n).padStart(3)}${FATAL.has(code) || isParseError(code) ? "   ← gated" : ""}`);
  }
  process.exit(0);   // informational
}

const fatal = lines.filter((l) => { const m = l.match(/error (TS\d+)/); return m && (FATAL.has(m[1]) || isParseError(m[1])); });
if (fatal.length) {
  console.error(`✗ ${fatal.length} fatal type error(s) — code that cannot run:\n`);
  for (const l of fatal) console.error(`  ${l}`);
  console.error(`\nGated codes: ${[...FATAL].join(", ")}`);
  process.exit(1);
}
// Print the backlog on every run, not just the informational one. A number that
// is never shown is a number nobody works down: the gate used to say only that it
// passed, so the remaining errors were invisible to anyone who did not go looking
// — and two of them were live defects, not strictness preferences.
console.log(`✓ no fatal type errors (${lines.length} non-fatal remain)`);
const byCode = {};
for (const l of lines) { const m = l.match(/error (TS\d+)/); if (m) byCode[m[1]] = (byCode[m[1]] ?? 0) + 1; }
for (const [code, n] of Object.entries(byCode).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${code.padEnd(8)} ${String(n).padStart(3)}`);
}
if (lines.length) console.log("  Fix a code's last occurrence, add it to FATAL, and it can never come back.");
