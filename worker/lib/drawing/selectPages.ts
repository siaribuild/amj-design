// Steps 2 (strategy) and 4 (select pages) of the SKILL.md method — both
// judgements, both pure, both Worker-side (02-design-v2.md §1, §2). Step 4
// runs BEFORE any rendering, from step 3's text/word output (AC-12).
import type { Inventory, PageText } from "./contract";
import { normalizeOpeningRef } from "../ai/energyMap";

export type PageTier = "elevation" | "floorplan" | "schedule" | "siteplan";

export interface SelectedPage {
  pageNo: number;
  tier: PageTier;
  reason: string;
}

export type Strategy = "text_vector" | "text_raster" | "scanned";

/** `scanned` STOPS the file and names the gap — it never falls through to a
 *  guess (AC-13): a document nobody could read must be reportable as such. */
// Checked in this order because "WINDOW SCHEDULE" and "SITE PLAN" are more
// specific than the bare "PLAN" a floor plan's own title carries — a
// schedule sheet bound into a plan set, or a site plan among floor plans,
// must not fall through to the looser pattern (AC-20).
const TIER_PATTERNS: [PageTier, RegExp][] = [
  [
    "schedule",
    /\b(?:window|door)?\s*schedule\b/i,
  ],
  ["elevation", /\belevation\b/i],
  ["siteplan", /\bsite\s*plan\b/i],
  ["floorplan", /\b(?:floor\s*plan|ground\s*floor|first\s*floor|upper\s*floor)\b/i],
];

function classify(text: string): { tier: PageTier; reason: string } | null {
  for (const [tier, pattern] of TIER_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return { tier, reason: `title text: "${match[0].trim()}"` };
  }
  return null;
}

/** Step 4, from step 3's output — before any rendering (AC-12). A page whose
 *  text matches none of the four tiers is not selected: rasterising it later
 *  would spend tokens on a page nobody asked to read. `tagVocabulary` is the
 *  closed set of opening tags found on schedule-tier pages — the only tags
 *  `floorplan_read` is allowed to place (ADR 0015 point 2 / D-4). */
export function selectPages(_inv: Inventory, pages: PageText[]): { selected: SelectedPage[]; tagVocabulary: string[] } {
  const selected: SelectedPage[] = [];
  const tags = new Set<string>();
  // A separator between the letter and the digits ("W-04", "W 04") is
  // presentation, same as the schedule extractor's own tags — normalized
  // through the SAME function (normalizeOpeningRef) other joins across this
  // codebase already use, so "W-04" and "w04" land in the vocabulary as one
  // tag rather than two (Codex review finding).
  const TAG_PATTERN = /\b([WD])[\s-]?(\d{1,3}[A-Za-z]?)\b/g;
  for (const page of pages) {
    const hit = classify(page.text);
    if (!hit) continue;
    selected.push({ pageNo: page.pageNo, tier: hit.tier, reason: hit.reason });
    if (hit.tier === "schedule") {
      for (const m of page.text.matchAll(TAG_PATTERN)) {
        const normalized = normalizeOpeningRef(`${m[1]}${m[2]}`);
        if (normalized) tags.add(normalized);
      }
    }
  }
  return { selected, tagVocabulary: [...tags] };
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
