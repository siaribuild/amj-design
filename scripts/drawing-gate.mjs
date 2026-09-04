#!/usr/bin/env node
// The release gate (docs/runs/plan-parse-method §7.1, AC-G1…G4): a
// re-runnable comparator between what a run actually read
// (`drawing_reading` rows, exported to readings.json) and the
// owner-confirmed ground truth for the same drawing set (labels.json).
//
// Usage: node scripts/drawing-gate.mjs readings.json labels.json
//
// readings.json: an array, one row per `drawing_reading` (or its JSON
// export) — external_ref, split_state/split_json, orientation_state/
// orientation, elevation_state/elevation, room_state/room_label, gap_code.
//
// labels.json: { [externalRef]: { split, orientation, elevation, room, drawn } }
// `drawn: false` means the opening genuinely has no division to read on any
// elevation (e.g. a fixed-only door) — it is excluded from the scored set
// rather than counted as a miss (AC-G3: reported "not drawn on any
// elevation", not silently dropped).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function valueOf(reading, field) {
  if (!reading) return undefined;
  const stateKey = `${field}_state`;
  if (reading[stateKey] === "not_read") return "__NOT_READ__";
  if (reading[stateKey] !== "value") return null;
  if (field === "split") return reading.split_json ? JSON.parse(reading.split_json) : null;
  if (field === "room") return reading.room_label ?? null;
  return reading[field] ?? null;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const FIELDS = ["split", "orientation", "elevation", "room"];
// The face-mapped engine claims several things about one opening, and one
// number for the whole run hides which of them is failing: which wall it is on
// (elevation), which number along it (order), which frame on the elevation is
// it (frame), what the frame is divided into (composition), and in what
// proportions (ratio).
const FACE_FIELDS = {
  order: (reading) => reading.wall_order ?? null,
  frame: (reading) => reading.frame_box_json ? JSON.parse(reading.frame_box_json) : null,
  ratio: (reading) => {
    const split = valueOf(reading, "split");
    return split && split !== "__NOT_READ__" ? split.units?.map((unit) => unit.ratio) ?? null : null;
  },
};
const LABEL_FIELDS = new Set([...FIELDS, ...Object.keys(FACE_FIELDS), "composition", "drawn", "pageNo"]);

function invalidLabel(label) {
  if (!label || typeof label !== "object" || Array.isArray(label)) return "missing label";
  const keys = Object.keys(label);
  const unknown = keys.filter((key) => !LABEL_FIELDS.has(key));
  if (unknown.length) return `unknown field(s): ${unknown.join(", ")}`;
  if (!keys.some((key) => FIELDS.includes(key) || key in FACE_FIELDS || key === "composition" || key === "pageNo") && label.drawn !== false) {
    return "no scored fields";
  }
  return null;
}

function compositionMatches(split, expected) {
  if (!split || split.units?.length !== expected.length) return false;
  return expected.every((unit, index) => {
    const actual = split.units[index];
    return actual?.operation === unit.operation
      && (unit.widthMm == null || actual.derivedWidthMm === unit.widthMm);
  });
}

/** One opening's verdict: every labelled field is scored independently. */
export function compareOpening(reading, label) {
  const labelError = invalidLabel(label);
  if (labelError) {
    return { verdict: "mismatch", fields: { label: "mismatch" }, note: `invalid label: ${labelError}` };
  }
  if (!reading) {
    return { verdict: "not_read", gapCode: reading?.gap_code ?? null };
  }
  const fields = {};
  let allMatch = true;
  if (label?.composition) {
    const match = compositionMatches(valueOf(reading, "split"), label.composition);
    fields.composition = match ? "match" : "mismatch";
    if (!match) allMatch = false;
  }
  for (const field of FIELDS) {
    if (field === "split" && label?.composition) continue;
    if (label && !Object.hasOwn(label, field) && !(field === "split" && label.drawn === false)) continue;
    if (field === "split" && label?.drawn === false) {
      fields[field] = "not_drawn";
      continue;
    }
    const readingVal = valueOf(reading, field);
    const labelVal = label ? label[field] ?? null : null;
    const match = deepEqual(readingVal, labelVal);
    fields[field] = match ? "match" : "mismatch";
    if (!match) allMatch = false;
  }
  for (const [field, read] of Object.entries(FACE_FIELDS)) {
    if (!label || !Object.hasOwn(label, field)) continue;
    const match = deepEqual(read(reading), label[field]);
    fields[field] = match ? "match" : "mismatch";
    if (!match) allMatch = false;
  }
  if (label && Object.hasOwn(label, "pageNo")) {
    const pageMatch = reading.page_no === label.pageNo;
    fields.pageNo = pageMatch ? "match" : "mismatch";
    if (!pageMatch) allMatch = false;
  }
  return { verdict: allMatch ? "match" : "mismatch", fields, ...(label?.drawn === false ? { note: "split not drawn on any elevation" } : {}) };
}

/** Deterministic per-opening verdicts across the union of both files'
 *  external refs, sorted — the same two inputs always produce the same
 *  output (AC-G4). `summary.of` excludes not_drawn openings: they are not
 *  drawn evidence, so they cannot be a scored miss. */
export function runGate(readings, labels) {
  const byRef = new Map(readings.map((r) => [r.external_ref, r]));
  const allRefs = new Set([...byRef.keys(), ...Object.keys(labels).filter((key) => !key.startsWith("__"))]);
  const perOpening = [...allRefs].sort().map((externalRef) => ({
    externalRef,
    ...compareOpening(byRef.get(externalRef), labels[externalRef]),
  }));
  const matched = perOpening.filter((o) => o.verdict === "match").length;
  const byField = {};
  for (const opening of perOpening) {
    for (const [field, verdict] of Object.entries(opening.fields ?? {})) {
      if (verdict === "not_drawn") continue;
      const tally = byField[field] ?? { scored: 0, matched: 0 };
      tally.scored += 1;
      if (verdict === "match") tally.matched += 1;
      byField[field] = tally;
    }
  }
  // An opening that came back unread is not a wrong answer, and counting it as
  // one hides the difference between an engine that is mistaken and one that
  // stopped — which are fixed in different places.
  const unresolved = perOpening.filter((opening) =>
    opening.verdict === "not_read" || readings.find((row) => row.external_ref === opening.externalRef)?.gap_code).length;
  return { perOpening, summary: { total: perOpening.length, of: perOpening.length, matched, byField, unresolved } };
}

// CLI entry — only when run directly, not when imported by the test suite.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const [readingsPath, labelsPath] = process.argv.slice(2);
  if (!readingsPath || !labelsPath) {
    console.error("Usage: node scripts/drawing-gate.mjs readings.json labels.json");
    process.exit(1);
  }
  const readings = JSON.parse(readFileSync(readingsPath, "utf8"));
  const labels = JSON.parse(readFileSync(labelsPath, "utf8"));
  console.log(JSON.stringify(runGate(readings, labels), null, 2));
}
