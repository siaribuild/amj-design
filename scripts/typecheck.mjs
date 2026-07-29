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
  "TS2448", // Block-scoped variable used before its declaration
  "TS2454", // Variable is used before being assigned
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
    console.log(`  ${code.padEnd(8)} ${String(n).padStart(3)}${FATAL.has(code) ? "   ← gated" : ""}`);
  }
  process.exit(0);   // informational
}

const fatal = lines.filter((l) => { const m = l.match(/error (TS\d+)/); return m && FATAL.has(m[1]); });
if (fatal.length) {
  console.error(`✗ ${fatal.length} fatal type error(s) — code that cannot run:\n`);
  for (const l of fatal) console.error(`  ${l}`);
  console.error(`\nGated codes: ${[...FATAL].join(", ")}`);
  process.exit(1);
}
console.log(`✓ no fatal type errors (${lines.length} non-fatal remain — see: npm run typecheck)`);
