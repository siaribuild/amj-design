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

/** One opening's verdict: every labelled field is scored independently. */
export function compareOpening(reading, label) {
  if (!reading) {
    return { verdict: "not_read", gapCode: reading?.gap_code ?? null };
  }
  const fields = {};
  let allMatch = true;
  for (const field of FIELDS) {
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
  const allRefs = new Set([...byRef.keys(), ...Object.keys(labels)]);
  const perOpening = [...allRefs].sort().map((externalRef) => ({
    externalRef,
    ...compareOpening(byRef.get(externalRef), labels[externalRef]),
  }));
  const matched = perOpening.filter((o) => o.verdict === "match").length;
  return { perOpening, summary: { total: perOpening.length, of: perOpening.length, matched } };
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
