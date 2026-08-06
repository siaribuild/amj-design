// ═══════════════════════════════════════════════════════════════════════════════
// THE JOIN PRIMITIVES
//
// Everything in this feature is a join, and a join is only as good as its key.
//
// ─── The normaliser that is NOT here, and why ─────────────────────────────────
//
// This file used to define its own `normalizeTag`. That was a mistake, and it is
// worth recording rather than quietly deleting.
//
// It was written to end a real, live defect: applyPlanContext joined a plan's
// opening reference to a schedule row by EXACT STRING EQUALITY, so a plan
// printing "W-04" against a schedule printing "W04" silently dropped that
// opening's room and orientation. But a normaliser for exactly that already
// existed — `normalizeOpeningRef` in ../ai/energyMap.ts — and was already used
// at five ref joins in the same pipeline. applyPlanContext was the only join
// that had been left raw. So the fix needed no new module at all.
//
// Worse, the two disagreed: normalizeTag("W04") gave "W4" while
// normalizeOpeningRef("W04") gives "W04". They AGREE on unpadded refs and
// diverge on exactly the zero-padded sets that motivated the work — so the
// second normaliser turned one wrong key into two incompatible ones. A join
// primitive is only worth anything if it is the ONLY one.
//
//   → Use `normalizeOpeningRef` for every window/door tag, here and everywhere.
//
// Known limitation, stated rather than fixed: it strips separators and case but
// NOT leading zeros, so a set that writes "W4" on the plan and "W04" in the
// schedule still misses. Changing that would move five existing joins, so it is
// a deliberate follow-up, not a silent gap.
//
// `looksLikeSheetRef` went with it. It answered true for "WD12" — a documented
// window-tag prefix — so its only plausible caller, a tag harvester, would have
// used it to discard real doors; and it answered false for real sheet prefixes
// it did not know ("E01", "SK1", "DWG 05"). Two failure directions, in a helper
// whose own comment conceded that position is the real discriminator. A weak
// boolean that can be wrong both ways is worse than the unrouted state the
// design already defines as safe.
// ═══════════════════════════════════════════════════════════════════════════════

/** Canonical form of a sheet number — the tag circle's second line, joined to
 *  the title block of the sheet it points at.
 *
 *    "S08" "S-08" "S 8" "s08"  →  "S8"
 *    "A-101"                   →  "A101"
 *
 *  Leading zeros go because a title block and a tag reference the same sheet
 *  with different padding all the time.
 *
 *  This is a SHEET key, not an opening key — a different namespace with a
 *  different consumer — which is why it survives where normalizeTag did not.
 *  It is still shape-only: "WC 1" and "AS 2047" both normalise happily, so a
 *  caller must know it is looking at a sheet reference before asking. */
export function normalizeSheetId(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return null;
  // Two letters at most: three would swallow a room label ("BED 3"), and a sheet
  // id never carries a trailing letter, so there is no suffix group.
  const m = /^([A-Z]{1,2})[\s._-]*0*(\d{1,4})$/.exec(s);
  if (!m) return null;
  return `${m[1]}${String(Number(m[2]))}`;
}

/** Compass azimuth (degrees clockwise from north) → the eight-point name the
 *  rest of the platform uses for orientation.
 *
 *  A wall's azimuth comes from its segment direction plus the sheet's north
 *  point; this converts that into the vocabulary applyPlanContext already
 *  understands, so a geometry-derived orientation drops into the existing field
 *  rather than introducing a second spelling of the same fact. */
export function azimuthToOrientation(deg: number | null): string | null {
  if (deg == null || !Number.isFinite(deg)) return null;
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return names[idx];
}
