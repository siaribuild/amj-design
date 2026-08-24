// Strip the dead `certified` / `dataSource` values out of the Sanity documents.
//
// Phase 1 of ops2 "Why this product" (design §4.1, spec CERT-AC-7/8, ADR 0011)
// at depth (c): the code no longer reads these fields and the Studio no longer
// offers them, and this removes the VALUES that are left behind. Two fields, two
// homes:
//
//   product.performanceVariants[]        -> unset `certified` and `dataSource`
//   thermalProfile.rows[]                -> unset `certified`
//
// `certificationRef` and `wersWindowId` are NOT touched. A WERS reference is a
// real fact about a product; it simply is not a gate (grill conclusions §5).
//
// ── THE EXPORT GATE (CERT-AC-8 / X-AC-12) ───────────────────────────────────
// This is an irreversible write against a production dataset, and the D1 lesson
// (a table rebuild that cascade-deleted production rows off a clean local run)
// is the same lesson. So the run REFUSES unless it is handed a dated dataset
// export that exists, is non-empty, and was taken within the last 24 hours.
//
// The gate is deliberately the FIRST thing that happens: it runs before the
// Sanity client is even imported, so a refusal costs no network call and can be
// proven offline.
//
//   npx sanity exec scripts/strip-certified.mjs --with-user-token -- --export ../sanity-production-2026-08-24.tar.gz
//   npx sanity exec scripts/strip-certified.mjs --with-user-token -- --export ../sanity-production-2026-08-24.tar.gz --apply
//
// Take the export with:  npx sanity dataset export production <path>
import { statSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
/** Run both gates, report, and stop — no client, no network, no write. */
const CHECK_ONLY = argv.includes("--check");
const EXPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Anchored to THIS FILE, not to cwd: the operator runs this through
// `npx sanity exec` from the sanity/ directory, where a cwd-relative
// "scripts/catalogue" resolves to a path that does not exist. The gate fails
// closed, so a cwd-relative default would refuse every legitimate run.
const DEFAULT_CATALOGUE_DIR = join(fileURLToPath(new URL("../..", import.meta.url)), "scripts", "catalogue");

const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};

/** The gate. Returns the verified export path, or exits non-zero saying which
 *  half of "a verified export exists" is missing. No client, no network. */
function requireVerifiedExport() {
  const path = flag("--export");
  if (!path) {
    fail(
      "No --export given. This run rewrites production documents irreversibly, so it\n"
      + "requires a dated dataset export taken within the last 24 hours:\n"
      + "  npx sanity dataset export production ../sanity-production-<date>.tar.gz\n"
      + "then re-run with --export <that path>.",
    );
  }
  let stat;
  try {
    stat = statSync(path);
  } catch {
    fail(`The export at ${path} does not exist. Take one before running this.`);
  }
  if (!stat.isFile() || stat.size === 0) {
    fail(`The export at ${path} is empty. An empty archive is not a restorable export.`);
  }
  const ageMs = Date.now() - stat.mtimeMs;
  if (ageMs > EXPORT_MAX_AGE_MS) {
    const hours = Math.round(ageMs / (60 * 60 * 1000));
    fail(
      `The export at ${path} is ${hours} h old. A stale export cannot restore the\n`
      + "documents this run is about to rewrite. Take a fresh one and re-run.",
    );
  }
  return path;
}

// ── The re-population predicate (design §2.6, CERT-AC-3 / CERT-AC-12) ───────
//
// EXPORTED, and the source scan in scripts/tests/certified-removal.test.mjs
// imports it rather than restating it: the gate that refuses to strip and the
// criterion that says the tree is clean must agree about what a re-population
// looks like, and two copies of a regex do not stay agreed.
//
// `dataSource` has a SECOND, live, correct meaning — the provenance of a size
// rule or a configuration (worker/lib/estimator/types.ts). That concept is fine
// and is not what was deleted, so the predicate is keyed on the OBJECT the
// field belongs to rather than on the bare token: a bare-token match would
// force renaming a concept nobody asked to remove.
const stripSourceComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Unconditional: these two names only ever meant the deleted gate. */
const DEAD_NAMES = /\b(isCertified|energyCertified)\b/;
/** `certified` as a field name, a projection member, a read, or a written value. */
const CERTIFIED_FIELD = /(^|[^A-Za-z0-9_$.])certified\s*[:,}]|\.certified\b|["']certified["']/;
const DATA_SOURCE = /\bdataSource\b/;
/** The object whose `certified` / `dataSource` this phase deleted. */
const THERMAL_CONTEXT = /performanceVariants?|thermalProfile|thermalProfileRow|GlassCell|\bvariantId\b|\bvariant\b|glazingOption|wersWindowId|\buValue\b|\bshgc\b|\brows\b/;
/** The DIFFERENT concept, which survives deliberately. */
const PROVENANCE_CONTEXT = /deriveConfiguration|deriveDimensionRule|\bdimensionRule\b|\bconfiguration\b/;

/** The lines of `source` that would re-populate the deleted field. Comments are
 *  stripped first: a comment is where a supersession gets EXPLAINED. */
export function findCertifiedWrites(source) {
  const lines = stripSourceComments(source).split("\n");
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (DEAD_NAMES.test(line)) { hits.push(line.trim()); continue; }
    if (!CERTIFIED_FIELD.test(line) && !DATA_SOURCE.test(line)) continue;
    // Nearest enclosing concept wins. Unclassifiable fails CLOSED: an
    // unattributable `certified` is a finding, never a pass.
    let provenance = false;
    for (let j = i; j >= 0 && i - j <= 30; j -= 1) {
      if (THERMAL_CONTEXT.test(lines[j])) break;
      if (PROVENANCE_CONTEXT.test(lines[j])) { provenance = true; break; }
    }
    if (!provenance) hits.push(line.trim());
  }
  return hits;
}

/** The second gate (design §4.1, rev 4). A strip launched from a checkout whose
 *  importers still write the field would be undone by the next import run, so
 *  it is refused at the point of harm rather than discovered later in a design
 *  doc. Reads files only — no client, no network, same discipline as the export
 *  gate above. */
function requireNoRepopulation(dir) {
  let entries;
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith(".mjs"));
  } catch {
    fail(`The catalogue script directory ${dir} does not exist, so this run cannot prove\n`
      + "its own checkout will not re-populate the fields it is about to delete.");
  }
  const offenders = [];
  for (const file of entries) {
    for (const line of findCertifiedWrites(readFileSync(join(dir, file), "utf8"))) {
      offenders.push(`  ${file}: ${line}`);
    }
  }
  if (offenders.length) {
    fail(
      `This checkout can still re-populate what this run deletes:\n${offenders.join("\n")}\n`
      + "Strip from a checkout where the importers no longer write the field, or the\n"
      + "next import puts it straight back (CERT-AC-12).",
    );
  }
  return entries.length;
}

function fail(message) {
  console.error(`REFUSED: ${message}`);
  process.exit(1);
}

// ── What this run rewrites ──────────────────────────────────────────────────
//
// DECLARED, not spelled inline in a query string. The first version of this
// script queried `_type=="frameThermalProfile"`, which no schema declares: it
// would have passed both gates, reported completion, and left all 21 thermal
// profiles carrying `rows[].certified`. A destructive script that succeeds
// while doing nothing is worse than one that fails, because the gates around it
// make the result look verified.
//
// So the type and field names are data, and CERT-AC-7's test asserts each one
// against a `defineType` / `defineField` in sanity/schemaTypes.ts.
export const STRIP_TARGETS = [
  { type: "product", noun: "product", arrayField: "performanceVariants", fields: ["certified", "dataSource"] },
  { type: "thermalProfile", noun: "thermal profile", arrayField: "rows", fields: ["certified"] },
];

const countQuery = (t) => `count(*[_type=="${t.type}"])`;
const dirtyQuery = (t) => `*[_type=="${t.type}" && count(${t.arrayField}[${
  t.fields.map((f) => `defined(${f})`).join(" || ")}]) > 0]{
    _id, name, "items": ${t.arrayField}[]{ _key, ${t.fields.join(", ")} }
  }`;

/** Read one target, refusing to proceed when the type matches NOTHING.
 *
 *  The two zeroes mean opposite things and must not be conflated:
 *    count(type) === 0  -> the type name is wrong (or the dataset is empty).
 *                          Loud: this is the failure mode that shipped.
 *    count(type) > 0, no dirty docs -> everything is already clean. That is the
 *                          state after a SUCCESSFUL run, so it is a no-op and
 *                          not an error, or the script cries wolf every second
 *                          time it is run. */
export async function loadTarget(fetchFn, target) {
  const total = await fetchFn(countQuery(target));
  if (!Number.isFinite(total) || total === 0) {
    throw new Error(
      `REFUSED: no \`${target.type}\` document exists in this dataset, so this run `
      + "would report success having changed nothing. Check the type name against "
      + "sanity/schemaTypes.ts before trusting any result from it.",
    );
  }
  return { total, docs: await fetchFn(dirtyQuery(target)) };
}

async function main() {
  const exportPath = requireVerifiedExport();
  console.log(`Verified export: ${exportPath}`);
  const scanned = requireNoRepopulation(resolve(flag("--catalogue-dir") ?? DEFAULT_CATALOGUE_DIR));
  console.log(`Checkout will not re-populate: ${scanned} catalogue script(s) clean.`);
  if (CHECK_ONLY) {
    console.log("── CHECK ONLY ── both gates pass; nothing was read from Sanity.");
    return;
  }
  console.log(APPLY ? "── WRITING ──" : "── DRY RUN (pass --apply to write) ──");

  // Imported only once the gate has passed, so a refusal never constructs a
  // client and never reaches the network.
  const { getCliClient } = await import("sanity/cli");
  const client = getCliClient({ apiVersion: "2024-01-01" });

  const fetchFn = (query) => client.fetch(query);
  const loaded = [];
  for (const target of STRIP_TARGETS) {
    // Throws, loudly, when the type matches nothing at all.
    const { total, docs } = await loadTarget(fetchFn, target);
    let items = 0;
    console.log(`\n${docs.length} of ${total} ${target.noun}(s) carry certification values:`);
    for (const doc of docs) {
      const dirty = (doc.items ?? []).filter((it) => it && target.fields.some((f) => it[f] !== undefined));
      items += dirty.length;
      console.log(`   ${String(doc.name ?? doc._id).padEnd(46)} ${dirty.length} ${target.arrayField} entr(ies)`);
    }
    loaded.push({ target, docs, items });
  }

  console.log(`\n${loaded.map((l) => `${l.items} ${l.target.noun} field-set(s)`).join(", ")} to clear.`);

  if (!APPLY) {
    console.log("\nNothing was written. Re-run with --apply.");
    return;
  }

  // Keyed unsets only: every path names one array member by its _key and one
  // field on it, so nothing else in the document can move.
  let tx = client.transaction();
  let patched = 0;
  for (const { target, docs } of loaded) {
    for (const doc of docs) {
      const paths = [];
      for (const item of doc.items ?? []) {
        if (!item?._key) continue;
        for (const f of target.fields) {
          if (item[f] !== undefined) paths.push(`${target.arrayField}[_key=="${item._key}"].${f}`);
        }
      }
      if (paths.length) { tx = tx.patch(doc._id, (patch) => patch.unset(paths)); patched += 1; }
    }
  }
  if (!patched) {
    console.log("\nEvery target document is already clean. Nothing to write.");
    return;
  }
  await tx.commit({ visibility: "sync" });

  console.log(`\nDone. Verify against ${exportPath}: certificationRef and wersWindowId byte-identical,`);
  console.log("no `certified` and no variant `dataSource` anywhere, nothing else changed (CERT-AC-7).");
}

// Only when RUN, never when imported: the test suite imports
// `findCertifiedWrites` from here so the gate and CERT-AC-3 share one predicate.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
