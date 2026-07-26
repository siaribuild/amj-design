// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULE PARSE — pure, deterministic extraction of window/door schedule rows
// from the text of a plan PDF (as produced by a text-layer extractor such as
// unpdf). No I/O, no model calls — shared by the Worker's deterministic extractor,
// the (future) AI adapter's post-processing, and the unit tests.
//
// The parser is HEADER-DRIVEN: it reads each schedule's header row to learn the
// column order (crucially, whether HEIGHT or WIDTH comes first — real schedules
// vary) and whether a MATERIAL column is present (doors). Each subsequent data
// row is one line; a trailing non-data line between two data rows is treated as a
// wrapped COMMENTS continuation. Drawing noise around the table is ignored.
// ═══════════════════════════════════════════════════════════════════════════════

import { families } from "./catalogue";

export type ScheduleSection = "window" | "door";

export interface RawScheduleRow {
  section: ScheduleSection;
  itemNo: string; // as printed, e.g. "1", "14" (gaps preserved)
  heightMm: number | null;
  widthMm: number | null;
  headHtMm: number | null;
  glazing: string | null; // CLEAR / TRANSLUCENT / N/A …
  doubleGlaze: boolean | null; // D.GLAZE REQ. → YES/NO
  material: string | null; // doors only: TIMBER / ALUMINIUM …
  typeText: string | null; // OFFSET AWNING / AWNING / FIXED / ENTRY / STACKER SLIDING …
  comments: string | null;
  raw: string; // the original line(s), for provenance
}

export interface ParsedSchedule {
  rows: RawScheduleRow[];
  warnings: string[];
  windowCount: number;
  doorCount: number;
}

// Known type phrases, matched longest-first so "OFFSET AWNING" wins over "AWNING".
const WINDOW_TYPES = [
  "OFFSET AWNING", "SASHLESS DOUBLE HUNG", "DOUBLE HUNG", "SINGLE HUNG",
  "TILT AND TURN", "TILT & TURN", "GLASS LOUVRE", "LOUVRE", "LOUVER",
  "AWNING", "CASEMENT", "SLIDING", "FIXED",
];
const DOOR_TYPES = [
  "STACKER SLIDING", "SLIDING STACKER", "LIFT SLIDE", "LIFT-SLIDE",
  "SLIM FRAME SLIDING", "BI-FOLD", "BIFOLD", "BI FOLD", "FRENCH",
  "STACKER", "SLIDING", "HINGED", "PIVOT", "AXIS", "ENTRY", "CASEMENT",
];

// Lines that definitively end a schedule section (page annotations / title block).
const HARD_STOP = /^(NOTE:|NOTES:|REVISION|DESCRIPTION|SHEET|SCALE|DRAWN BY|JOB NO|DATE\b|PROPOSED RESIDENCE|CLIENT\b|DO NOT SCALE|GENERAL NOTES|LEGEND\b|ABBREVIATIONS)/i;

const isDataStart = (line: string) => /^\s*\d{1,3}\b/.test(line);
const isWindowHeader = (l: string) => /\bW\s*N[°ºo]?\b/i.test(l) && /HEIGHT/i.test(l) && /WIDTH/i.test(l);
const isDoorHeader = (l: string) => /\bD\s*N[°ºo]?\b/i.test(l) && /HEIGHT/i.test(l) && /WIDTH/i.test(l);

interface ColumnSpec {
  numericOrder: ("height" | "width" | "head")[]; // order the numeric columns appear
  hasMaterial: boolean;
}

// Read a header row into a column spec. Falls back to HEIGHT-then-WIDTH (the most
// common Australian convention) with a warning flag baked into numericOrder length.
function headerSpec(header: string, section: ScheduleSection): ColumnSpec {
  const up = header.toUpperCase();
  const order: ("height" | "width" | "head")[] = [];
  // Record the position of each numeric label so we can order them as printed.
  const marks: { key: "height" | "width" | "head"; at: number }[] = [];
  const hI = up.indexOf("HEIGHT");
  const wI = up.indexOf("WIDTH");
  const headI = up.search(/HEAD\s*HT|HEAD\s*HEIGHT|HEAD\b/);
  if (hI >= 0) marks.push({ key: "height", at: hI });
  if (wI >= 0) marks.push({ key: "width", at: wI });
  if (headI >= 0 && headI !== hI) marks.push({ key: "head", at: headI });
  marks.sort((a, b) => a.at - b.at);
  for (const m of marks) order.push(m.key);
  if (!order.length) order.push("height", "width"); // safe default
  return { numericOrder: order, hasMaterial: section === "door" && /MATERIAL/i.test(header) };
}

// The recognised type phrases for a section: the built-in list PLUS every
// catalogue family name and its Sanity-authored aliases. Multi-word trade tags
// ("TOP HUNG", "PICTURE WINDOW") are therefore understood as whole phrases
// without a code change — the parser and the matcher share one vocabulary.
//
// Sorted longest-phrase-first so a tag always beats its own prefix: "TOP HUNG"
// must never be read as "TOP" + comment "HUNG", nor "OFFSET AWNING" as "OFFSET".
function typeVocabulary(section: ScheduleSection): string[] {
  const base = section === "window" ? WINDOW_TYPES : DOOR_TYPES;
  const category = section === "window" ? "windows" : "doors";
  const fromCatalogue: string[] = [];
  for (const f of families) {
    if (f.categorySlug !== category) continue;
    fromCatalogue.push(f.name, ...(f.aliases ?? []));
  }
  const seen = new Set<string>();
  const all: string[] = [];
  for (const phrase of [...base, ...fromCatalogue]) {
    const norm = (phrase || "").trim().toUpperCase().replace(/\s+/g, " ");
    if (norm && !seen.has(norm)) { seen.add(norm); all.push(norm); }
  }
  return all.sort((a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length);
}

// Greedy longest-first type match. Returns [typeText, remainingComment].
// The type is returned AS PRINTED (original casing/punctuation) — "Top hung"
// stays "Top hung" — so the line reproduces the schedule faithfully; downstream
// family resolution normalises case and punctuation itself.
function splitTypeAndComment(tokens: string[], section: ScheduleSection): [string | null, string] {
  const joined = tokens.join(" ");
  const up = joined.toUpperCase();
  for (const phrase of typeVocabulary(section)) {
    if (up === phrase) return [joined, ""];
    if (up.startsWith(phrase + " ")) return [joined.slice(0, phrase.length), joined.slice(phrase.length).trim()];
  }
  // Unknown type: take the first token as a best-guess type, rest as comment.
  // The matcher then fails to map it to a family and raises an ERROR — an
  // unrecognised tag is never silently priced as something else.
  if (tokens.length) return [tokens[0], tokens.slice(1).join(" ")];
  return [null, ""];
}

const intOrNull = (t: string): number | null => (/^\d{2,5}$/.test(t) ? parseInt(t, 10) : null);
const yesNo = (t: string): boolean | null => {
  const u = (t || "").toUpperCase();
  if (u === "YES" || u === "Y") return true;
  if (u === "NO" || u === "N") return false;
  return null; // N/A, blank
};

// Parse one data row's tokens (after the leading item number) into a RawScheduleRow.
function parseRow(section: ScheduleSection, itemNo: string, rest: string[], spec: ColumnSpec, raw: string): RawScheduleRow {
  const row: RawScheduleRow = {
    section, itemNo, heightMm: null, widthMm: null, headHtMm: null,
    glazing: null, doubleGlaze: null, material: null, typeText: null, comments: null, raw,
  };
  const toks = [...rest];
  // 1) leading numeric run → assign to labelled columns in printed order
  const nums: number[] = [];
  while (toks.length && intOrNull(toks[0]) !== null) nums.push(parseInt(toks.shift() as string, 10));
  spec.numericOrder.forEach((key, i) => {
    if (i >= nums.length) return;
    if (key === "height") row.heightMm = nums[i];
    else if (key === "width") row.widthMm = nums[i];
    else row.headHtMm = nums[i];
  });
  // Any extra leading numbers beyond the known columns: ignore (defensive).
  // 2) GLAZING (single token, may be N/A)
  if (toks.length) row.glazing = toks.shift() as string;
  // 3) D.GLAZE REQ. (single token)
  if (toks.length) row.doubleGlaze = yesNo(toks.shift() as string);
  // 4) MATERIAL (doors only)
  if (spec.hasMaterial && toks.length) row.material = toks.shift() as string;
  // 5) TYPE (greedy) + 6) COMMENTS (remainder)
  const [typeText, comment] = splitTypeAndComment(toks, section);
  row.typeText = typeText;
  row.comments = comment || null;
  return row;
}

/**
 * Parse the concatenated text of a plan's pages into schedule rows.
 * `pages` is an array of per-page text (e.g. unpdf extractText mergePages:false).
 */
export function parseScheduleText(pages: string[]): ParsedSchedule {
  const warnings: string[] = [];
  const lines = pages.join("\n").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());

  const rows: RawScheduleRow[] = [];
  type State = "outside" | "window" | "door";
  let state: State = "outside";
  let spec: ColumnSpec | null = null;
  let last: RawScheduleRow | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (isWindowHeader(line)) { state = "window"; spec = headerSpec(line, "window"); last = null; continue; }
    if (isDoorHeader(line)) { state = "door"; spec = headerSpec(line, "door"); last = null; continue; }
    if (/EXTERNAL DOOR SCHEDULE|DOOR SCHEDULE/i.test(line) && state === "window") {
      // door header may be on the next line; drop to outside until we see it
      state = "outside"; spec = null; last = null; continue;
    }
    if (/WINDOW SCHEDULE/i.test(line)) { continue; } // title line above the header

    if (state === "outside") continue;
    const section: ScheduleSection = state === "window" ? "window" : "door";

    if (isDataStart(line)) {
      const toks = line.split(" ");
      const itemNo = toks.shift() as string;
      const row = parseRow(section, itemNo, toks, spec as ColumnSpec, line);
      rows.push(row);
      last = row;
      continue;
    }

    // Non-data line inside a section: either a wrapped comment continuation or the
    // end of the table (page annotations / title block).
    if (HARD_STOP.test(line) || line.split(" ").length > 6) { state = "outside"; spec = null; last = null; continue; }
    if (last) {
      last.comments = [last.comments, line].filter(Boolean).join(" ");
      last.raw += "\n" + line;
    }
  }

  const windowCount = rows.filter((r) => r.section === "window").length;
  const doorCount = rows.filter((r) => r.section === "door").length;
  if (!rows.length) warnings.push("no_schedule_rows_found");
  return { rows, warnings, windowCount, doorCount };
}
