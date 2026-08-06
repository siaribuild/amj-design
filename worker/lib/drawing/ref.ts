// ═══════════════════════════════════════════════════════════════════════════════
// THE JOIN PRIMITIVES — one normaliser each for a window tag and a sheet number
//
// Everything in this feature is a join, and a join is only as good as its key.
// There is an existing, live defect this file exists to end: applyPlanContext
// matches a plan's opening reference to a schedule row with EXACT STRING
// EQUALITY, so a plan printing "W-04" against a schedule printing "W04" silently
// drops that opening's room and orientation. Nothing reports it.
//
// So: one normaliser, used by every producer and every consumer of a tag.
// ═══════════════════════════════════════════════════════════════════════════════

/** Canonical form of a window/door tag.
 *
 *    "W-04" "w 4" "W04" "W4"  →  "W4"
 *    "D07"  "D-7"             →  "D7"
 *    "WD12"                   →  "WD12"
 *
 *  Leading zeros go because a schedule and a plan disagree about them constantly
 *  and nobody means anything by it. The letter prefix is kept and upper-cased
 *  because W4 and D4 are different openings.
 *
 *  Returns null for anything that is not a tag — a grid bubble's "A", a room
 *  name, a dimension. Callers treat null as "not a tag", never as a wildcard. */
export function normalizeTag(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return null;
  // TWO letters at most. Three would swallow a room label: "BED 3" matches
  // letters-then-digits perfectly and would normalise to a window called BED3,
  // which then joins against nothing and reports a phantom opening. Real tag
  // prefixes are W, D, WD, SD — never three.
  const m = /^([A-Z]{1,2})[\s._-]*0*(\d{1,4})([A-Z]?)$/.exec(s);
  if (!m) return null;
  const [, prefix, digits, suffix] = m;
  // A bare letter is a grid bubble, not a tag. A tag always carries a number.
  if (!digits) return null;
  return `${prefix}${String(Number(digits))}${suffix}`;
}

/** Canonical form of a sheet number — the tag circle's second line.
 *
 *    "S08" "S-08" "S 8" "s08"  →  "S8"
 *    "A-101"                   →  "A101"
 *
 *  Same leading-zero rule and for the same reason: a title block and a tag
 *  reference the same sheet with different padding all the time. */
export function normalizeSheetId(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return null;
  // Same two-letter bound and the same reason — and a sheet id never carries a
  // trailing letter, so there is no suffix group here.
  const m = /^([A-Z]{1,2})[\s._-]*0*(\d{1,4})$/.exec(s);
  if (!m) return null;
  return `${m[1]}${String(Number(m[2]))}`;
}

/** Does this text run look like a sheet reference rather than a window tag?
 *
 *  Both are letter+number, so the shapes overlap. The discriminator is position:
 *  inside a tag circle the sheet reference is the LOWER of two runs. This helper
 *  exists for the cases where position is unavailable and only the strings are —
 *  it is deliberately conservative and the caller should prefer geometry. */
export function looksLikeSheetRef(raw: string): boolean {
  const s = raw.trim().toUpperCase();
  // ONE to three digits. It required two, which made it fail on the very form
  // normalizeSheetId itself emits: normalizeSheetId("S08") is "S8", and
  // looksLikeSheetRef("S8") answered false — so the one guard against reading a
  // sheet reference as a window tag rejected its own canonical output.
  //
  // This is a WEAK hint and callers must prefer geometry. "S8" is a perfectly
  // well-formed window tag under normalizeTag too; inside a tag circle the
  // discriminator is POSITION — the sheet reference is the lower of the two
  // runs — and this exists only for the cases where position is unavailable.
  return /^(S|A|DA|WD)[\s._-]*\d{1,3}$/.test(s);
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
