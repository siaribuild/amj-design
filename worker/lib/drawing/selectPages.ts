// Steps 2 (strategy) and 4 (select pages) of the SKILL.md method — both
// judgements, both pure, both Worker-side (02-design-v2.md §1, §2). Step 4
// runs BEFORE any rendering, from step 3's text/word output (AC-12).
import type { Inventory, PageText } from "./contract";

export type PageTier = "elevation" | "floorplan" | "schedule" | "siteplan";

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
const TIER_PATTERNS: [PageTier, RegExp][] = [
  [
    "schedule",
    /\b(?:window|door)?\s*schedule\b/i,
  ],
  [
    "elevation",
    /(?:^|\n)\s*ELEVATIONS?\s*[-:]?\s*[A-D]\b/im,
  ],
  ["siteplan", /\bsite\s*plan\b/i],
  ["floorplan", /\b(?:floor\s*plan|ground\s*floor|first\s*floor|upper\s*floor)\b/i],
];

function classify(text: string): { tier: PageTier; reason: string }[] {
  const hits: { tier: PageTier; reason: string }[] = [];
  for (const [tier, pattern] of TIER_PATTERNS) {
    const match = pattern.exec(text);
    if (match) hits.push({ tier, reason: `title text: "${match[0].trim()}"` });
  }
  return hits;
}

/** A page matching no tier is not selected. The closed tag vocabulary comes
 * from authoritative schedule rows at the enrichment call site. */
export function selectPages(_inv: Inventory, pages: PageText[]): { selected: SelectedPage[] } {
  const selected: SelectedPage[] = [];
  for (const page of pages) {
    const hits = classify(page.text);
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
