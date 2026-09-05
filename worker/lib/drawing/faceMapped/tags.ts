import { normalizeOpeningRef } from "../../ai/energyMap";

/**
 * What a tag is: a type letter and a serial number (owner ruling, 2026-09-05).
 * W001, W01, W1, W-1 and "W 1" are one opening — the letter says what kind and
 * the number says which, and the rest is a draughtsman's habit. Everything that
 * compares tags compares this.
 */
export function canonicalTag(entry: string): string {
  const tag = normalizeOpeningRef(entry) ?? entry;
  const split = /^([A-Z]+)0*(\d+)([A-Z]*)$/.exec(tag);
  return split ? `${split[1]}${Number(split[2])}${split[3]}` : tag;
}

/**
 * The roster's spellings, and every spelling a drawing might print them as.
 *
 * Measured on a real set: its window schedule prints W1, W2, W3 and its floor
 * plans print W01, W02, W03. Matched as strings that places none of them. Every
 * spelling of a tag's number is admitted, and what comes back out is always the
 * name the schedule gave. A schedule that spells one number twice has named the
 * same opening twice, which the roster's own duplicate rule refuses.
 */
export function rosterVocabulary(roster: string[]): { vocabulary: Set<string>; tagOf: Map<string, string> } {
  const vocabulary = new Set<string>();
  const tagOf = new Map<string, string>();
  for (const entry of roster) {
    const tag = normalizeOpeningRef(entry) ?? entry;
    const split = /^([A-Z]+)0*(\d+)([A-Z]*)$/.exec(tag);
    // Padded to one, two or three digits: the widths drawings print.
    const spellings = split
      ? [1, 2, 3].map((width) => `${split[1]}${String(Number(split[2])).padStart(width, "0")}${split[3]}`)
      : [];
    for (const spelling of new Set([tag, ...spellings])) {
      vocabulary.add(spelling);
      if (!tagOf.has(spelling)) tagOf.set(spelling, tag);
    }
  }
  return { vocabulary, tagOf };
}

