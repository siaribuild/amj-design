// Deterministic rank-string generator for seeding @sanity/orderable-document-
// list's orderRank field. Produces lexicographically-sortable strings
// "a000", "a001", … in the order given.
//
// The plugin recomputes its own fractional rank between two neighbours on
// EVERY future drag (LexoRank-style string bisection), so the exact spacing
// chosen here only ever matters once — for the first reorder after seeding.
// A flat, zero-padded sequence is enough; nothing more elaborate is needed.
//
// A near-identical copy lives in scripts/build-catalogue-ndjson.cjs (CommonJS,
// so it can't import this ESM module directly) — keep the two in step.
export function ranksFor(count) {
  const width = Math.max(3, String(Math.max(count - 1, 0)).length);
  return Array.from({ length: count }, (_, i) => `a${String(i).padStart(width, "0")}`);
}
