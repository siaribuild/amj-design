// Steps 2 (strategy) and 4 (select pages) of the SKILL.md method — both
// judgements, both pure, both Worker-side (02-design-v2.md §1, §2). Step 4
// runs BEFORE any rendering, from step 3's text/word output (AC-12).
import type { Inventory, PageText } from "./contract";

export type PageTier = "detail" | "elevation" | "floorplan" | "schedule" | "siteplan";

export interface SelectedPage {
  pageNo: number;
  tier: PageTier;
  reason: string;
}

export type Strategy = "text_vector" | "text_raster" | "scanned";

/** `scanned` STOPS the file and names the gap — it never falls through to a
 *  guess (AC-13): a document nobody could read must be reportable as such. */
// Ordering is stable output ordering only. A sheet may carry more than one
// tier (most importantly, schedules commonly share an elevation sheet).
const TITLE_META = String.raw`(?:[ \t]+(?:(?:SCALE[ \t]+)?\d+(?:\.\d+)?\s*[:/]\s*\d+(?:\.\d+)?|(?:SHEET[ \t]+)?[A-Z]{1,3}[- ]?\d{1,4}|REV(?:ISION)?[ \t]+[A-Z0-9]+))*[ \t]*$`;
const TITLE_TIER_PATTERNS: [PageTier, RegExp][] = [
  [
    "elevation",
    new RegExp(String.raw`(?:\bELEVATIONS\b|\bELEVATIONS?\s*[-:]?\s*[A-D]\b|^[ \t]*(?:(?:NORTH|SOUTH|EAST|WEST|FRONT|REAR|LHS|RHS|SIDE)|(?:LEFT|RIGHT)(?:[ \t]+SIDE)?)[ \t]+ELEVATIONS?${TITLE_META})`, "im"),
  ],
  ["siteplan", /\bsite\s*plan\b/i],
  [
    "floorplan",
    new RegExp(String.raw`(?:\b(?:floor\s*plan|ground\s*floor|first\s*floor|upper\s*floor)\b|^[ \t]*(?:(?:(?:GROUND|LOWER|UPPER|FIRST|SECOND)\s+LEVEL|LEVEL\s*[A-Z0-9]+)\s+PLAN|PLAN\s*[-:]?\s*(?:(?:GROUND|LOWER|UPPER|FIRST|SECOND)\s+LEVEL|LEVEL\s*[A-Z0-9]+))${TITLE_META})`, "im"),
  ],
];

function classify(text: string, titleText: string): { tier: PageTier; reason: string }[] {
  const hits: { tier: PageTier; reason: string }[] = [];
  const schedule = /\b(?:window|door|opening|joinery)\s*schedule\b/i.exec(text);
  if (schedule) hits.push({ tier: "schedule", reason: `text: "${schedule[0].trim()}"` });
  for (const [tier, pattern] of TITLE_TIER_PATTERNS) {
    const match = pattern.exec(titleText);
    if (match) hits.push({ tier, reason: `title text: "${match[0].trim()}"` });
  }
  return hits;
}

/** A page matching no tier is not selected. The closed tag vocabulary comes
 * from authoritative schedule rows at the enrichment call site. */
export function selectPages(_inv: Inventory, pages: PageText[]): { selected: SelectedPage[] } {
  const selected: SelectedPage[] = [];
  for (const page of pages) {
    const geo = _inv.pages.find((item) => item.pageNo === page.pageNo);
    const titleWords = geo && page.words.length
      ? page.words.filter((word) => word.top >= geo.heightPt * 0.85).sort((a, b) => a.top - b.top || a.x0 - b.x0)
      : [];
    const hits = classify(page.text, titleWords.length ? titleWords.map((word) => word.text).join(" ") : page.text);
    for (const hit of hits) selected.push({ pageNo: page.pageNo, tier: hit.tier, reason: hit.reason });
  }
  return { selected };
}

export function chooseStrategy(inv: Inventory): Strategy {
  const hasText = inv.fonts.length > 0 && inv.pages.some((p) => p.textChars > 0);
  if (!hasText) return "scanned";
  // Raster-behind-text: a text layer exists (it will still extract fine) but
  // the average page is mostly image — a vector CAD print rasterised on
  // export, or a scanned overlay with an OCR text layer underneath.
  const avgImageFraction = inv.pages.reduce((sum, p) => sum + p.imageAreaFraction, 0) / Math.max(inv.pages.length, 1);
  return avgImageFraction > 0.5 ? "text_raster" : "text_vector";
}
