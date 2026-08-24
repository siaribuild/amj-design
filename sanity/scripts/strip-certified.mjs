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
import { statSync, readdirSync, readFileSync, createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
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

/** The gate. Returns the verified export and what is in it, or exits non-zero
 *  saying which part of "a verified export exists" is missing. Reads the file;
 *  constructs no client and makes no network call. */
async function requireVerifiedExport() {
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

  // Recent and non-empty is not a backup. OPEN IT.
  let manifest;
  try {
    manifest = await readExportManifest(path);
  } catch (error) {
    fail(
      `The export at ${path} cannot be trusted to restore anything: ${error.message}.\n`
      + "Take a real one and re-run:\n"
      + "  npx sanity dataset export production ../sanity-production-<date>.tar.gz",
    );
  }

  // And it has to contain the documents THIS run is about to mutate. An export
  // missing a type is not a backup of that type, however recent it is.
  const missing = STRIP_TARGETS.filter((t) => !manifest.byType.get(t.type));
  if (missing.length) {
    fail(
      `The export at ${path} contains no ${missing.map((t) => `\`${t.type}\``).join(" or ")} document,\n`
      + "so it could not put back what this run is about to change. Export the whole\n"
      + "dataset rather than a subset, and re-run.",
    );
  }

  console.log(
    `Verified export: ${path}\n`
    + `  ${manifest.documents} published document(s), including `
    + `${STRIP_TARGETS.map((t) => `${manifest.byType.get(t.type)} ${t.type}`).join(", ")}.`,
  );
  return { path, manifest };
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

/** THE ONE POPULATION BOTH SIDES COUNT.
 *
 *  This started as two filters: the manifest skipped ids beginning `drafts.`,
 *  while the live queries ran under the raw perspective and counted them. With
 *  one draft thermalProfile in production, live said 22, a correct and complete
 *  export said 21, and the gate refused a good backup on every run \u2014 the second
 *  gate in this script to fail closed on a legitimate operation.
 *
 *  So the live query now returns IDS rather than a count, and this predicate
 *  runs over both sides. There is no GROQ draft filter left to drift from the
 *  JavaScript one, because there is only one filter. A draft cannot restore a
 *  published document, which is why published is the population that matters. */
export const isPublishedId = (id) => !String(id ?? "").startsWith("drafts.");

const identityQuery = (t) => `*[_type=="${t.type}"]{_id, _rev}`;
const dirtyQuery = (t) => `*[_type=="${t.type}" && count(${t.arrayField}[${
  t.fields.map((f) => `defined(${f})`).join(" || ")}]) > 0]{
    _id, name, "items": ${t.arrayField}[]{ _key, ${t.fields.join(", ")} }
  }`;


// ── Reading the export, rather than trusting its file stat (P1-A) ─────────
//
// The gate used to check recency and non-emptiness, which any recent non-empty
// file satisfies: a text file, a truncated archive, half a download. It then
// permitted irreversible production mutations on the strength of a file nobody
// had established was a usable backup. Same lesson as the wrong type name, one
// level up — a gate that passes without checking what it claims to check is
// worse than no gate, because it manufactures confidence.
//
// A `sanity dataset export` tarball is gzip over tar, with the documents in a
// `data.ndjson` member (at the root or under a dataset directory) and assets
// after it. Tar is read here directly rather than through a dependency: this is
// the guard standing between us and an unrecoverable mistake, and it should
// have as few moving parts as possible. Entries are consumed as they stream and
// the read STOPS at data.ndjson, so an export carrying hundreds of megabytes of
// images is never held in memory.

/** Yields { name, body } per tar member, stopping when `wanted` returns true. */
async function* tarMembers(stream, wanted) {
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 512) break;
      const header = buf.subarray(0, 512);
      if (header.every((b) => b === 0)) return;             // end-of-archive
      const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
      const rawSize = header.subarray(124, 136).toString("utf8").replace(/\0.*$/s, "").trim();
      const size = Number.parseInt(rawSize, 8);
      if (!Number.isFinite(size) || size < 0) throw new Error("tar header is not readable");
      const total = 512 + Math.ceil(size / 512) * 512;
      if (buf.length < total) break;                        // member not fully arrived
      const body = buf.subarray(512, 512 + size);
      buf = buf.subarray(total);
      if (wanted(name)) { yield { name, body }; return; }
    }
  }
  // Ran out of input mid-member: the archive is torn.
  if (buf.length) throw new Error("the archive ends part way through a file");
}

/** What the export actually contains, or a thrown reason it cannot be trusted.
 *  Reads the file; constructs no client and makes no network call. */
export async function readExportManifest(path) {
  const gz = createReadStream(path).pipe(createGunzip());
  let member = null;
  try {
    for await (const m of tarMembers(gz, (name) => name.split("/").pop() === "data.ndjson")) member = m;
  } catch (error) {
    throw new Error(`it is not a readable gzip archive (${error.message})`);
  }
  if (!member) throw new Error("it contains no `data.ndjson`, so it is not a dataset export");

  const text = member.body.toString("utf8");
  const lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) throw new Error("its `data.ndjson` is empty, so it would restore nothing");

  const byType = new Map();
  // Identities, for the target types only: counting is not identifying, and an
  // export of a DIFFERENT dataset holding the same number of documents must not
  // read as a backup of this one.
  const idsByType = new Map(STRIP_TARGETS.map((t) => [t.type, new Map()]));
  for (const [i, line] of lines.entries()) {
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      // A torn download stops mid-document, and this is where that shows up.
      throw new Error(`its \`data.ndjson\` stops part way through document ${i + 1}, so it is truncated`);
    }
    if (!d?._id || !d?._type) throw new Error(`document ${i + 1} has no _id/_type, so this is not a dataset export`);
    // Drafts cannot restore a published document, so they are not counted as
    // one — the same basis the live comparison uses.
    if (!isPublishedId(d._id)) continue;
    byType.set(d._type, (byType.get(d._type) ?? 0) + 1);
    idsByType.get(d._type)?.set(d._id, d._rev ?? null);
  }
  const documents = [...byType.values()].reduce((a, b) => a + b, 0);
  if (!documents) throw new Error("it carries only drafts, which cannot restore a published document");
  return { documents, byType, idsByType };
}


/** The archive check proves the file is a real export. It cannot prove the
 *  export is a backup OF THIS DATASET AS IT STANDS.
 *
 *  COUNTING IS NOT IDENTIFYING. Per-type counts pass an export from a different
 *  dataset, and a stale one that happens to hold the same number of target
 *  documents — and the run would then mutate production irreversibly against an
 *  archive holding none of the documents it would need to put back. So every
 *  live document must be present in the export BY ID, at the revision it is
 *  currently at.
 *
 *  Holding MORE than live is fine: documents deleted since the export are not a
 *  restore risk. This runs once the client exists and strictly before any write. */
export function exportGap(manifest, target, liveDocs) {
  const inExport = manifest.idsByType?.get(target.type) ?? new Map();
  const missing = [];
  const drifted = [];
  for (const [id, rev] of liveDocs) {
    if (!inExport.has(id)) missing.push(id);
    else if (rev && inExport.get(id) && inExport.get(id) !== rev) drifted.push(id);
  }
  const sample = (ids) => `${ids.slice(0, 3).join(", ")}${ids.length > 3 ? `, +${ids.length - 3} more` : ""}`;
  if (missing.length) {
    return `${missing.length} live \`${target.type}\` document(s) are not in the export at all `
      + `(${sample(missing)}). It is an export of a different or older dataset, and could `
      + "not put back what this run is about to change.";
  }
  if (drifted.length) {
    return `${drifted.length} live \`${target.type}\` document(s) have changed since the export `
      + `was taken (${sample(drifted)}). Restoring from it would discard those edits.`;
  }
  return null;
}

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
  const rows = await fetchFn(identityQuery(target));
  const live = new Map((Array.isArray(rows) ? rows : [])
    .filter((r) => r?._id && isPublishedId(r._id))
    .map((r) => [r._id, r._rev ?? null]));
  if (!live.size) {
    throw new Error(
      `REFUSED: no published \`${target.type}\` document exists in this dataset, so this `
      + "run would report success having changed nothing. Check the type name against "
      + "sanity/schemaTypes.ts before trusting any result from it.",
    );
  }
  const all = await fetchFn(dirtyQuery(target));
  const carrying = Array.isArray(all) ? all.filter((d) => d?._id) : [];
  // The same filter again, so what gets MUTATED is exactly what the export can
  // restore. A draft is neither counted nor patched.
  return {
    total: live.size,
    live,
    docs: carrying.filter((d) => isPublishedId(d._id)),
    draftsCarrying: carrying.filter((d) => !isPublishedId(d._id)),
  };
}

async function main() {
  const { path: exportPath, manifest } = await requireVerifiedExport();
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
    const { total, live, docs, draftsCarrying } = await loadTarget(fetchFn, target);
    // And the export has to be able to put back what is actually there — BY ID,
    // not by tally. This is the last gate, and it is still before any write.
    const gap = exportGap(manifest, target, live);
    if (gap) {
      fail(`The export at ${exportPath} cannot restore this dataset: ${gap}\n`
        + "Take a fresh export and re-run.");
    }
    // Drafts are not mutated, because the export cannot restore them. A draft
    // still carrying the field would reintroduce it the day somebody publishes
    // it, so that is said out loud rather than left silent. NOT a refusal:
    // production has such a draft today, and blocking on it would make this the
    // third gate in this script to fail closed on a legitimate run.
    if (draftsCarrying.length) {
      console.log(
        `  NOTE: ${draftsCarrying.length} DRAFT ${target.noun}(s) still carry the field and are left `
        + `untouched (${draftsCarrying.map((d) => d._id).slice(0, 3).join(", ")}).\n`
        + "  Publishing or discarding them is how that value finally goes.",
      );
    }
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
