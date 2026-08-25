// Phase 3a of ops2 "Why this product": the universal capture (spec §7, design
// §4.2-§4.5). Every save that sets or changes a line's product or variant records
// that product+variant's Uw and SHGC onto the line itself, as they stood at that
// moment — on every save path alike.
//
// This suite is the PURE half: the SNAP-AC-2 source-level scan, and the
// resolver's matching rules. The behavioural half — that a save still succeeds,
// with the same status, price and response — lives in why-capture-api.test.mjs,
// over a real Worker and a real D1.
//
// SNAP-AC-2 is not belt-and-braces; it is the mechanism. A hand-maintained list
// of the sites that write a line's product has been incomplete on every attempt
// by three different readers — one, then four, then eight, then fifteen. The
// scan asserts a property of EVERY match and never a count, and it refuses to
// report success over an empty or shrunken match set.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { makeRunDir, projectRoot } from "./helpers.mjs";

// ── The scan ────────────────────────────────────────────────────────────────

const KEYWORD = /\b(?:INSERT\s+INTO|UPDATE)\s+quote_line\b/g;

/** Every `INSERT INTO quote_line` / `UPDATE quote_line` statement in one source
 *  file, as the SQL text from the keyword to the end of the literal holding it.
 *
 *  Statements are written as string or template literals passed to
 *  `DB.prepare(...)`, and in every one of them the keyword is the first thing
 *  inside the literal — which is what makes a backward scan for the opening
 *  delimiter sound. `assertsExtractable` below refuses to guess when it isn't. */
export function quoteLineStatements(src) {
  const out = [];
  for (const m of src.matchAll(KEYWORD)) {
    const start = m.index;
    let open = -1;
    for (let i = start - 1; i >= 0; i--) {
      if (src[i] === "`" || src[i] === '"' || src[i] === "'") { open = i; break; }
    }
    if (open < 0 || src.slice(open + 1, start).trim() !== "") {
      // Not a literal opening straight onto the keyword: the extractor cannot
      // honestly say where this statement ends, so it says so rather than
      // silently returning a fragment that names no column and passes.
      out.push({ sql: src.slice(start, start + 400), unextractable: true });
      continue;
    }
    const end = src.indexOf(src[open], start);
    out.push({ sql: src.slice(start, end < 0 ? src.length : end), unextractable: false });
  }
  return out;
}

/** SQL string literals are DATA, not column references. `routes/parse.ts` sets
 *  `edited_fields='["product_slug",…]'` — the text of a column name inside a
 *  quoted value, which is not a write to that column and must not be read as
 *  one. Stripping them is what makes the rule mechanical rather than a
 *  whitelist. */
const columnText = (sql) => sql.replace(/'[^']*'/g, "''");

export const namesProduct = (sql) =>
  /\bproduct_slug\b|\bselected_variant_id\b/.test(columnText(sql));
export const namesFigures = (sql) =>
  /\bperformance_figures_json\b/.test(columnText(sql));

async function tsFilesUnder(dir) {
  const out = [];
  for (const entry of await readdir(join(projectRoot, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (/^(node_modules|dist|\.wrangler|\.vite)$/.test(entry.name)) continue;
    if (entry.isDirectory()) out.push(...await tsFilesUnder(rel));
    else if (/\.ts$/.test(entry.name)) out.push(rel);
  }
  return out;
}

// The design's index (§4.2) is fifteen product-writing statements, W1-W15. The
// scan encodes no count as a PASS condition — this is the floor beneath which a
// clean result means the pattern stopped matching, not that the tree is clean.
const INDEXED_PRODUCT_WRITERS = 15;

test("SNAP-AC-2 the scan's own predicate distinguishes a writer from a non-writer (non-vacuity)", () => {
  // Exercised against known-bad and known-good source before it is trusted to
  // report over the tree. A predicate that silently stops matching reports
  // success over nothing.
  assert.equal(namesProduct("UPDATE quote_line SET product_slug=?, qty=? WHERE id=?"), true,
    "a product write is caught");
  assert.equal(namesProduct("UPDATE quote_line SET selected_variant_id=NULL WHERE id=?"), true,
    "a variant write is caught");
  assert.equal(namesProduct("UPDATE quote_line SET status='technical_review' WHERE id=?"), false,
    "a status-only write is not a product write");
  assert.equal(
    namesProduct(`UPDATE quote_line SET origin='schedule', edited_fields='["product_slug","qty"]' WHERE id=?`),
    false,
    "a column name inside a SQL string literal is data, not a column reference");
  assert.equal(namesFigures("UPDATE quote_line SET product_slug=?, performance_figures_json=? WHERE id=?"), true,
    "the figures column is recognised");
  assert.equal(namesFigures("UPDATE quote_line SET product_slug=? WHERE id=?"), false,
    "and its absence is recognised");

  // The extractor stops at the end of the literal, and only there.
  const src = 'a.prepare("UPDATE quote_line SET qty=?, status=\'ready\' WHERE id=?").bind(product_slug)';
  const [only] = quoteLineStatements(src);
  assert.equal(only.unextractable, false);
  assert.equal(only.sql, "UPDATE quote_line SET qty=?, status='ready' WHERE id=?",
    "the statement ends at the literal's delimiter, not at the first inner quote");
});

test("SNAP-AC-2 every statement anywhere under worker/** that writes a line's product also writes its figures", async () => {
  const files = await tsFilesUnder("worker");

  // A clean result over a walk that went nowhere proves nothing.
  for (const named of [
    "worker/routes/ops.ts", "worker/routes/projects.ts", "worker/routes/parse.ts",
    "worker/lib/composite.ts", "worker/lib/parse.ts", "worker/lib/ai/proposal.ts",
  ]) assert.ok(files.includes(named), `the walk reached ${named}`);
  assert.ok(files.length > 40, `the walk reached the tree, not a corner (${files.length} files)`);

  const productWriters = [];
  const offenders = [];
  const unextractable = [];
  for (const rel of files) {
    const src = await readFile(join(projectRoot, rel), "utf8");
    for (const { sql, unextractable: bad } of quoteLineStatements(src)) {
      const head = `${rel}: ${sql.slice(0, 90).replace(/\s+/g, " ")}`;
      if (bad) { unextractable.push(head); continue; }
      if (!namesProduct(sql)) continue;
      productWriters.push(head);
      if (!namesFigures(sql)) offenders.push(head);
    }
  }

  assert.deepEqual(unextractable, [],
    `a quote_line statement could not be read to its end — the scan cannot vouch for it:\n${unextractable.join("\n")}`);
  assert.ok(productWriters.length >= INDEXED_PRODUCT_WRITERS,
    `the scan found ${productWriters.length} product-writing statements, fewer than the design's ${INDEXED_PRODUCT_WRITERS} — the pattern has stopped matching`);
  assert.deepEqual(offenders, [],
    `a save sets a line's product without recording its figures:\n${offenders.join("\n")}`);
});

// ── The bind-arity scan: the second list layer nobody was guarding ──────────
//
// SNAP-AC-2 asserts a property of COLUMN NAMES. It cannot see a bind. Adding
// `performance_figures_json` to a statement means adding a `?` to its SQL AND an
// argument to its `.bind(...)`, in the right position — two hand-maintained
// lists per statement, in a phase whose entire history is hand-maintained lists
// being wrong. A miscount does not fail to compile: D1 either throws at runtime
// or, worse, silently shifts every later value by one.
//
// Written by the tester while verifying this phase and landed here, because a
// scan that only ever runs once has verified one commit rather than the rule.

/** SQLite parameters. `?N` is NUMBERED and may repeat — three `?2` are ONE bound
 *  value, not three, which is the difference between a real arity defect and a
 *  false alarm. Anonymous `?` are positional and each is its own. String
 *  literals are data: `'?'` inside SQL is a question mark, not a parameter. */
export function placeholders(sql) {
  const code = sql.replace(/'[^']*'/g, "''");
  const numbered = new Set();
  let anon = 0;
  for (const m of code.matchAll(/\?(\d*)/g)) { if (m[1]) numbered.add(m[1]); else anon++; }
  return anon + numbered.size;
}

/** Blank out comments, preserving offsets and newlines, so every later scan can
 *  treat the source as code only. Strings and templates are stepped over intact
 *  — a `//` inside a URL is not a comment. */
export function stripComments(src) {
  const out = src.split("");
  const blank = (a, b) => { for (let x = a; x < b && x < out.length; x++) if (out[x] !== "\n") out[x] = " "; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i], two = src.slice(i, i + 2);
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      for (; i < src.length; i++) { if (src[i] === "\\") { i++; continue; } if (src[i] === q) break; }
      continue;
    }
    if (two === "//") { const e = src.indexOf("\n", i); const end = e < 0 ? src.length : e; blank(i, end); i = end; continue; }
    if (two === "/*") { const e = src.indexOf("*/", i); const end = e < 0 ? src.length : e + 2; blank(i, end); i = end; continue; }
  }
  return out.join("");
}

/** Top-level argument count of the call whose "(" is at `open`. */
export function argCount(src, open) {
  let depth = 0, seg = open + 1, count = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      for (; i < src.length; i++) {
        if (src[i] === "\\") { i++; continue; }
        if (q === "`" && src.slice(i, i + 2) === "${") {
          let d = 1; i += 2;
          for (; i < src.length && d; i++) { if (src[i] === "{") d++; else if (src[i] === "}") d--; }
          i--; continue;
        }
        if (src[i] === q) break;
      }
      continue;
    }
    if (c === "(" || c === "[" || c === "{") { depth++; if (depth === 1) seg = i + 1; continue; }
    if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return { count: count + (src.slice(seg, i).trim() ? 1 : 0), end: i };
      continue;
    }
    if (depth === 1 && c === ",") { count++; seg = i + 1; }
  }
  return { count: -1, end: -1 };
}

/** `const NAME = `…`;` in the same file — enough to resolve the SQL fragments
 *  this codebase interpolates (the mutation guards). Anything else stays
 *  UNRESOLVED and is REPORTED, never quietly counted as zero. */
function localConsts(src) {
  const map = new Map();
  for (const m of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*`([^`]*)`/g)) map.set(m[1], m[2]);
  return map;
}

/** Every `DB.prepare(<literal>).bind(...)` pair in one file. */
export function preparedBinds(raw, rel) {
  const src = stripComments(raw);
  const consts = localConsts(raw);
  const out = [];
  for (const m of src.matchAll(/\.prepare\(/g)) {
    let i = m.index + m[0].length;
    while (/\s/.test(src[i])) i++;
    const q = src[i];
    if (q !== '"' && q !== "'" && q !== "`") continue;
    let j = i + 1, interpolated = false;
    for (; j < src.length; j++) {
      if (src[j] === "\\") { j++; continue; }
      if (q === "`" && src.slice(j, j + 2) === "${") interpolated = true;
      if (src[j] === q) break;
    }
    let sql = raw.slice(i + 1, j);
    let unresolved = false;
    if (interpolated) {
      sql = sql.replace(/\$\{([A-Za-z_$][\w$]*)\}/g, (whole, name) => {
        if (consts.has(name)) return consts.get(name);
        unresolved = true; return whole;
      });
      if (/\$\{/.test(sql)) unresolved = true;
    }
    let k = j + 1;
    while (/\s/.test(src[k])) k++;
    if (src[k] === ",") { k++; while (/\s/.test(src[k])) k++; }
    if (src[k] !== ")") continue;
    k++;
    while (/\s/.test(src[k])) k++;
    if (src.slice(k, k + 5) !== ".bind") continue;
    k += 5;
    while (/\s/.test(src[k])) k++;
    if (src[k] !== "(") continue;
    const { count, end } = argCount(src, k);
    out.push({
      rel, line: src.slice(0, m.index).split("\n").length, sql, binds: count,
      // Carried onto the record, not merely computed. It was computed and
      // dropped in the first draft, so `checkable` filtered on `undefined` and
      // an unresolved statement was silently counted as if it were readable —
      // the same list-layer failure this scan exists to catch, inside the scan.
      unresolved, spread: /\.\.\./.test(src.slice(k, end)),
    });
  }
  return out;
}

const uncheckable = (s) => s.unresolved || s.spread || s.binds < 0;

test("bind-arity the scanner detects a miscount, and the things that are not one (non-vacuity)", () => {
  assert.equal(placeholders("SELECT 1 WHERE a=? AND b=?"), 2);
  assert.equal(placeholders("SELECT 1 WHERE a=?1 AND b=?1 AND c=?2"), 2,
    "a repeated numbered parameter is ONE bound value");
  assert.equal(placeholders("UPDATE t SET note='is it? yes' WHERE id=?"), 1,
    "a question mark inside a SQL string is punctuation, not a parameter");

  const good = `db.prepare("UPDATE t SET a=?, b=? WHERE id=?").bind(1, 2, 3);`;
  const bad = `db.prepare("UPDATE t SET a=?, b=? WHERE id=?").bind(1, 2);`;
  const [g] = preparedBinds(good, "g.ts");
  const [b] = preparedBinds(bad, "b.ts");
  assert.equal(placeholders(g.sql), g.binds, "the balanced pair reads as balanced");
  assert.notEqual(placeholders(b.sql), b.binds, "and the miscount is caught");

  // A statement it CANNOT read must say so rather than be counted as zero.
  const [u] = preparedBinds("db.prepare(`SELECT ${cols} WHERE id=?`).bind(x);", "u.ts");
  assert.equal(u.unresolved, true, "an unresolvable interpolation is flagged on the record itself");
  assert.equal(uncheckable(u), true, "and therefore excluded rather than judged");
  const [sp] = preparedBinds(`db.prepare("SELECT 1 WHERE a IN (?,?)").bind(...list);`, "s.ts");
  assert.equal(sp.spread, true, "a spread argument is not statically countable");

  // Comments are not code: SQL inside one must not be scanned.
  assert.equal(preparedBinds('// db.prepare("UPDATE t SET a=?").bind()\n', "c.ts").length, 0);
});

test("bind-arity every statically checkable prepare/bind pair under worker/** balances", async () => {
  const files = await tsFilesUnder("worker");
  const all = [];
  for (const rel of files) all.push(...preparedBinds(await readFile(join(projectRoot, rel), "utf8"), rel));

  const checkable = all.filter((s) => !uncheckable(s));
  assert.ok(all.length > 300, `the walk found the statements, not a corner (${all.length} pairs)`);
  assert.ok(checkable.length > 300, `and most are readable (${checkable.length} checkable)`);

  const bad = checkable
    .filter((s) => placeholders(s.sql) !== s.binds)
    .map((s) => `${s.rel}:${s.line} ${placeholders(s.sql)}? vs ${s.binds} binds :: ${s.sql.slice(0, 80).replace(/\s+/g, " ")}`);
  assert.deepEqual(bad, [], `a prepared statement's parameters and bound arguments disagree:\n${bad.join("\n")}`);
});

test("bind-arity every figures-writing statement is checked, and the one that cannot be is named", async () => {
  // The capture's own statements are the reason this scan exists, so they are
  // enumerated rather than left to the aggregate above.
  const files = await tsFilesUnder("worker");
  const writers = [];
  for (const rel of files) {
    for (const st of preparedBinds(await readFile(join(projectRoot, rel), "utf8"), rel)) {
      if (/performance_figures_json/.test(st.sql)) writers.push(st);
    }
  }
  assert.ok(writers.length >= INDEXED_PRODUCT_WRITERS,
    `every W1-W15 statement names the column (${writers.length} found)`);

  const skipped = writers.filter(uncheckable);
  // W1's ops UPDATE ends in `...mutableStates`, so its bind count is not a
  // static fact. It is covered behaviourally instead — six executed ops PATCHes
  // in why-capture-api.test.mjs bind it for real. Named here so a SECOND
  // uncheckable statement appearing is a failure rather than a silent skip.
  assert.deepEqual(skipped.map((s) => `${s.rel} (${s.spread ? "spread" : "unresolved"})`),
    ["worker/routes/ops.ts (spread)"],
    "exactly one figures writer is not statically checkable, and it is the known one");

  const bad = writers.filter((s) => !uncheckable(s) && placeholders(s.sql) !== s.binds)
    .map((s) => `${s.rel}:${s.line} ${placeholders(s.sql)}? vs ${s.binds} binds`);
  assert.deepEqual(bad, [], `a figures writer's binds do not match its parameters:\n${bad.join("\n")}`);
});

// ── The resolver (design §4.3) ──────────────────────────────────────────────

const runDir = await makeRunDir("figure-capture");
const bundle = join(runDir, "figures.mjs");
await build({
  stdin: {
    contents: `
      export * from ${JSON.stringify(join(projectRoot, "worker/lib/figures.ts"))};
      export { effectiveParsePick } from ${JSON.stringify(join(projectRoot, "worker/lib/parse.ts"))};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile: bundle, logLevel: "silent",
});
const {
  NULL_FIGURES, figuresJson, figuresFromVariant, resolveFigures, fetchFigureCatalogue,
  captureFigures, pickMoved, effectiveParsePick,
} = await import(pathToFileURL(bundle).href);

/** A captured unknown, as stored. Distinct from SQL NULL (SNAP-AC-8). */
const ABSENT_JSON = '{"uValue":null,"shgc":null}';

const variant = (variantId, glazingOptionSlug, uValue, shgc, over = {}) => ({
  variantId, glazingOptionSlug, glazingClass: "double_lowe", uValue, shgc,
  frameType: "aluminium", frameTechnology: "thermally_broken",
  certificationRef: null, pricingOptionSlugs: [], published: true, ...over,
});
const catalogue = (slug, variants) => new Map([[slug, variants]]);
const pick = (over = {}) => ({ productSlug: "amj-awning", variantId: null, options: {}, ...over });
const env = (projectId) => ({ SANITY_PROJECT_ID: projectId });

test("SNAP-AC-1 a named variant that exists in the catalogue resolves to its own figures", () => {
  const cat = catalogue("amj-awning", [
    variant("dg-clear", "double-clear", 3.9, 0.61),
    variant("dg-lowe", "double-lowe", 2.4, 0.32),
  ]);
  assert.deepEqual(
    resolveFigures(cat, pick({ variantId: "dg-lowe" })),
    { uValue: 2.4, shgc: 0.32 },
    "the named variant wins outright, whatever the options say");
});

test("SNAP-AC-6 a named variant the catalogue does not offer resolves to null, not to a sibling", () => {
  const cat = catalogue("amj-awning", [variant("dg-lowe", "double-lowe", 2.4, 0.32)]);
  assert.deepEqual(resolveFigures(cat, pick({ variantId: "dg-withdrawn" })), NULL_FIGURES);
});

test("SNAP-AC-6 an unpublished variant is not a match, even when it is named", () => {
  const cat = catalogue("amj-awning", [variant("dg-lowe", "double-lowe", 2.4, 0.32, { published: false })]);
  assert.deepEqual(resolveFigures(cat, pick({ variantId: "dg-lowe" })), NULL_FIGURES);
});

test("SNAP-AC-1 with no variant named, the glazing the line chose resolves it uniquely", () => {
  const cat = catalogue("amj-awning", [
    variant("dg-clear", "double-clear", 3.9, 0.61),
    variant("dg-lowe", "double-lowe", 2.4, 0.32),
  ]);
  assert.deepEqual(
    resolveFigures(cat, pick({ options: { glazing: "double-lowe", colour: "Dover White" } })),
    { uValue: 2.4, shgc: 0.32 });
});

test("an ambiguous resolution stores null rather than a guess (design §4.3)", () => {
  // Two published variants realise the same glazing. A fabricated figure a
  // reviewer trusts is worse than a stated absence.
  const cat = catalogue("amj-awning", [
    variant("dg-lowe-a", "double-lowe", 2.4, 0.32),
    variant("dg-lowe-b", "double-lowe", 2.1, 0.29),
  ]);
  assert.deepEqual(resolveFigures(cat, pick({ options: { glazing: "double-lowe" } })), NULL_FIGURES);

  // And with no glazing chosen at all, a product offering a choice is ambiguous
  // — but a product offering exactly one thing is not.
  assert.deepEqual(resolveFigures(cat, pick()), NULL_FIGURES);
  assert.deepEqual(
    resolveFigures(catalogue("amj-awning", [variant("only", "double-lowe", 2.4, 0.32)]), pick()),
    { uValue: 2.4, shgc: 0.32 },
    "one published variant is the only answer there is, not a guess between several");
});

test("SNAP-AC-6 a product absent from the catalogue resolves to null", () => {
  assert.deepEqual(
    resolveFigures(catalogue("amj-awning", [variant("x", "double-lowe", 2.4, 0.32)]),
      pick({ productSlug: "amj-something-else" })),
    NULL_FIGURES);
  assert.deepEqual(resolveFigures(new Map(), pick()), NULL_FIGURES);
});

test("SNAP-AC-8 a half-known variant records the half it knows and nulls the other", () => {
  const cat = catalogue("amj-awning", [variant("dg-lowe", "double-lowe", 2.4, null)]);
  assert.deepEqual(resolveFigures(cat, pick({ variantId: "dg-lowe" })), { uValue: 2.4, shgc: null });
});

test("SNAP-AC-8 figuresFromVariant records absence as absence, never as a missing key", () => {
  assert.deepEqual(figuresFromVariant({ uValue: 1.9, shgc: 0.4 }), { uValue: 1.9, shgc: 0.4 });
  assert.deepEqual(figuresFromVariant(null), NULL_FIGURES);
  assert.deepEqual(figuresFromVariant(undefined), NULL_FIGURES);
  assert.deepEqual(Object.keys(NULL_FIGURES).sort(), ["shgc", "uValue"],
    "present-and-null: both keys exist so a reader can tell a captured unknown from a line that predates the capture");
});

test("SNAP-AC-8 figuresJson stores present-and-null, and only a genuine no-capture as SQL NULL", () => {
  assert.equal(figuresJson({ uValue: 2.4, shgc: 0.32 }), '{"uValue":2.4,"shgc":0.32}');
  assert.equal(figuresJson(NULL_FIGURES), '{"uValue":null,"shgc":null}');
  assert.equal(figuresJson(null), null);
});

test("SNAP-AC-6/7 the catalogue read never throws and never surfaces a failure", async () => {
  // Three ways the catalogue can be unavailable. Every one of them ends the same
  // way: an empty catalogue, which resolves everything to null.
  const noSanity = await fetchFigureCatalogue({}, ["amj-awning"]);
  assert.equal(noSanity.size, 0, "no SANITY_PROJECT_ID configured");
  assert.deepEqual(resolveFigures(noSanity, pick({ variantId: "dg-lowe" })), NULL_FIGURES);

  let called = false;
  assert.equal((await fetchFigureCatalogue(env("x"), [], () => { called = true; return []; })).size, 0,
    "no slugs to ask about");
  assert.equal(called, false, "and no request made");

  const throws = () => { throw new Error("sanity 503"); };
  assert.equal((await fetchFigureCatalogue(env("x"), ["amj-awning"], throws)).size, 0,
    "a catalogue that throws yields an empty catalogue, not an exception");

  const rejects = () => Promise.reject(new Error("network"));
  assert.equal((await fetchFigureCatalogue(env("x"), ["amj-awning"], rejects)).size, 0,
    "and so does one that rejects");
});

test("SNAP-AC-7 one catalogue consultation per request, whatever the line count", async () => {
  const asked = [];
  const exec = async (_q, params) => {
    asked.push(params.slugs);
    return [{
      sanityProductId: "id1", schemaVersion: 1, slug: "amj-awning",
      performanceVariants: [{ variantId: "dg-lowe", glazingOptionSlug: "double-lowe", glazingClass: "double_lowe", uValue: 2.4, shgc: 0.32, published: true }],
    }];
  };
  const cat = await fetchFigureCatalogue(env("x"), ["amj-awning", "amj-awning", "amj-slider", ""], exec);
  assert.equal(asked.length, 1, "one query for the whole request");
  assert.deepEqual(asked[0], ["amj-awning", "amj-slider"], "distinct, non-empty slugs only");
  assert.deepEqual(resolveFigures(cat, pick({ variantId: "dg-lowe" })), { uValue: 2.4, shgc: 0.32 });
});

test("the catalogue read prefers the shared thermal profile over the legacy variants", async () => {
  // 15 of 34 products still have no thermalProfile, so BOTH shapes are live.
  // Reusing toCandidate is what keeps that decision in one place.
  const row = {
    sanityProductId: "id1", schemaVersion: 1, slug: "amj-awning",
    thermalProfile: {
      frameTechnology: "thermally_broken",
      rows: [{ glazingOptionSlug: "double-lowe", glazingClass: "double_lowe", uValue: 1.9, shgc: 0.28, published: true }],
    },
    performanceVariants: [{ variantId: "legacy", glazingOptionSlug: "double-lowe", glazingClass: "double_lowe", uValue: 9.9, shgc: 0.99, published: true }],
  };
  const withProfile = await fetchFigureCatalogue(env("x"), ["amj-awning"], async () => [row]);
  assert.deepEqual(resolveFigures(withProfile, pick({ options: { glazing: "double-lowe" } })),
    { uValue: 1.9, shgc: 0.28 }, "the profile wins");

  const legacyOnly = await fetchFigureCatalogue(env("x"), ["amj-awning"],
    async () => [{ ...row, thermalProfile: null }]);
  assert.deepEqual(resolveFigures(legacyOnly, pick({ variantId: "legacy" })),
    { uValue: 9.9, shgc: 0.99 }, "and without one the legacy variants still resolve");
});

// ── §1.4: figures move when, and only when, the pick moves ──────────────────
//
// Re-resolving an UNMOVED pick against today's catalogue is a recompute of a
// captured snapshot, which SNAP-AC-9 forbids outright. The outage — a room-label
// edit overwriting a good figure with present-and-null — is the loud symptom of
// that quieter breach, not a separate concern.

const stored = (over = {}) => ({
  productSlug: "amj-awning", variantId: null, glazing: "double-lowe",
  figuresJson: '{"uValue":2.4,"shgc":0.32}', ...over,
});
const lowe = catalogue("amj-awning", [variant("dg-lowe", "double-lowe", 2.4, 0.32)]);
const glazed = (glazing) => pick({ options: glazing ? { glazing } : {} });

test("SNAP-AC-9 an unmoved pick carries the stored figures forward verbatim, and consults nothing", () => {
  // The empty catalogue is the outage. If this resolved, the answer would be
  // present-and-null — so a stored figure surviving it is the whole property.
  assert.equal(
    captureFigures(new Map(), glazed("double-lowe"), stored()),
    '{"uValue":2.4,"shgc":0.32}',
    "a save that leaves the pick alone cannot erase a valid capture, outage or not");
  assert.equal(
    captureFigures(lowe, glazed("double-lowe"), stored({ figuresJson: '{"uValue":9.9,"shgc":0.99}' })),
    '{"uValue":9.9,"shgc":0.99}',
    "and it is not re-derived even when the catalogue is answering — a snapshot is not a lookup");
});

test("SNAP-AC-10 an unmoved pick never backfills a line that predates the capture", () => {
  assert.equal(captureFigures(lowe, glazed("double-lowe"), stored({ figuresJson: null })), null,
    "NULL stays NULL: figures fetched at edit time for a product chosen months ago are a display-time read in a snapshot's clothes");
  assert.equal(captureFigures(new Map(), glazed("double-lowe"), stored({ figuresJson: ABSENT_JSON })), ABSENT_JSON,
    "and a captured absence stays a captured absence rather than being re-asked");
});

test("SNAP-AC-1 a moved pick resolves fresh, and a failed resolution is honest THERE", () => {
  const moved = pick({ options: { glazing: "double-clear" } });
  assert.equal(captureFigures(new Map(), moved, stored()), ABSENT_JSON,
    "the stored 2.4/0.32 describes a configuration the row no longer has — pinning it would be worse than an honest null");
  assert.equal(
    captureFigures(
      catalogue("amj-awning", [variant("dg-clear", "double-clear", 3.9, 0.61)]), moved, stored()),
    '{"uValue":3.9,"shgc":0.61}',
    "and when the catalogue answers, the figures are the new pick's");
});

test("SNAP-AC-13 a new row has no stored pick, so it always resolves", () => {
  assert.equal(captureFigures(lowe, glazed("double-lowe"), null), '{"uValue":2.4,"shgc":0.32}');
  assert.equal(captureFigures(new Map(), glazed("double-lowe"), null), ABSENT_JSON);
});

test("SNAP-AC-16 / §7.0 the pick is exactly the resolver's inputs — nothing else can move the figures", () => {
  const moves = (p, s = stored()) => pickMoved(p, s);

  assert.equal(moves(glazed("double-lowe")), false, "the same pick has not moved");
  assert.equal(moves(pick({ productSlug: "amj-slider", options: { glazing: "double-lowe" } })), true,
    "a different product moves it");
  assert.equal(moves(glazed("double-clear")), true, "a different glass moves it");
  assert.equal(moves(glazed(null)), true, "and clearing the glass moves it too");

  // An option the resolver never consults cannot change what it would answer.
  assert.equal(
    moves(pick({ options: { glazing: "double-lowe", colour: "Monument", hardware: "D Shape" } })),
    false,
    "colour and hardware are not the pick — the resolver never reads them");

  // A pick naming no variant does not move the variant term; only an explicit,
  // different id does. This is what stopped W2 re-resolving on a dims-only edit
  // through a retained selected_variant_id.
  assert.equal(moves(glazed("double-lowe"), stored({ variantId: "dg-lowe" })), false,
    "a pick that names no variant leaves the variant term alone");
  assert.equal(moves(pick({ variantId: "dg-lowe", options: { glazing: "double-lowe" } }),
    stored({ variantId: "dg-lowe" })), false, "naming the same variant is not a move");
  assert.equal(moves(pick({ variantId: "dg-other", options: { glazing: "double-lowe" } }),
    stored({ variantId: "dg-lowe" })), true, "naming a different one is");

  assert.equal(pickMoved(glazed("double-lowe"), null), true, "and a row with no stored pick always resolves");
});

// ── W14: a lock is an input to the pick, not an exemption from the rule ─────
//
// The schedule upsert's human-edit guard (0019) locks field GROUPS
// independently: product_slug and options_json each have their own. The
// figures used to follow product_slug's lock alone, which was correct when
// "the pick" meant the product — and wrong the moment §7.0 defined the pick as
// product + variant + glazing. The two then came apart in BOTH directions, and
// only one of them is the case anyone pictures.
//
// The fix is to ask what the row will actually CARRY once the COALESCEs land,
// and hand that to the same predicate everything else uses.

const parsed = (over = {}) => ({ productSlug: "amj-slider", options: { glazing: "double-clear" }, ...over });
const draft = (over = {}) => ({
  product_slug: "amj-awning", options_json: '{"glazing":"double-lowe"}', ...over,
});

test("W14 with nothing locked the effective pick is simply what was parsed", () => {
  assert.deepEqual(effectiveParsePick(parsed(), draft(), []),
    { productSlug: "amj-slider", variantId: null, options: { glazing: "double-clear" } });
  assert.deepEqual(effectiveParsePick(parsed(), null, ["product_slug", "options_json"]),
    { productSlug: "amj-slider", variantId: null, options: { glazing: "double-clear" } },
    "an INSERT has no stored row, so a lock cannot mean anything");
});

test("W14 direction 1 — a LOCKED product with moved glazing keeps the product and takes the new glass", () => {
  // The old rule kept the figures because product_slug was locked, leaving them
  // describing the glazing the parse had just overwritten.
  const effective = effectiveParsePick(parsed(), draft(), ["product_slug"]);
  assert.deepEqual(effective,
    { productSlug: "amj-awning", variantId: null, options: { glazing: "double-clear" } },
    "the row keeps its product and takes the parsed glass — that pair is what it will carry");

  const storedRow = stored();
  assert.equal(pickMoved(effective, storedRow), true, "the glass moved, so the pick moved");
  assert.equal(
    captureFigures(catalogue("amj-awning", [
      variant("lowe", "double-lowe", 2.4, 0.32),
      variant("clear", "double-clear", 3.9, 0.61),
    ]), effective, storedRow),
    '{"uValue":3.9,"shgc":0.61}',
    "and the figures describe the glass the row now carries, not the one it lost");
});

test("W14 direction 2 — a LOCKED glazing with a moved product resolves against the glass the row keeps", () => {
  // The mirror, and the one nobody pictured: the figures refreshed from the
  // PARSED options while the row kept its locked ones.
  const effective = effectiveParsePick(parsed(), draft(), ["options_json"]);
  assert.deepEqual(effective,
    { productSlug: "amj-slider", variantId: null, options: { glazing: "double-lowe" } },
    "the row takes the parsed product and keeps its own glass");

  const storedRow = stored();
  assert.equal(pickMoved(effective, storedRow), true, "the product moved");
  assert.equal(
    captureFigures(catalogue("amj-slider", [
      variant("lowe", "double-lowe", 5.1, 0.55),
      variant("clear", "double-clear", 6.2, 0.7),
    ]), effective, storedRow),
    '{"uValue":5.1,"shgc":0.55}',
    "resolved against the LOCKED glass, because that is the glass the row still has");
});

test("W14 an identical re-upload moves nothing, whatever is locked", () => {
  const storedRow = stored();
  const same = parsed({ productSlug: "amj-awning", options: { glazing: "double-lowe" } });
  for (const locks of [[], ["product_slug"], ["options_json"], ["product_slug", "options_json"]]) {
    const effective = effectiveParsePick(same, draft(), locks);
    assert.equal(pickMoved(effective, storedRow), false, `unmoved with locks ${JSON.stringify(locks)}`);
    assert.equal(captureFigures(new Map(), effective, storedRow), '{"uValue":2.4,"shgc":0.32}',
      "so the capture stands, and no catalogue is consulted");
  }

  // Both locked and the parse disagreeing about everything is STILL unmoved:
  // the row carries what it carried.
  const effective = effectiveParsePick(parsed(), draft(), ["product_slug", "options_json"]);
  assert.equal(pickMoved(effective, storedRow), false,
    "a fully locked row is the definition of a pick that did not move");
});

test("W14 unreadable stored options are treated as no glass on record, never as a crash", () => {
  assert.deepEqual(
    effectiveParsePick(parsed(), draft({ options_json: "{not json" }), ["options_json"]),
    { productSlug: "amj-slider", variantId: null, options: {} });
});
