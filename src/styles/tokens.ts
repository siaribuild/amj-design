// ─── The palette, for the places a class cannot reach ─────────────────────────
//
// Every value here is `var(--token)`, NOT a hex. theme.css stays the single
// source of truth, so changing the scheme there changes it everywhere —
// including SVG stroke/fill attributes and the handful of genuinely dynamic
// inline styles, which is what these exist for.
//
// Before this, ten files each declared their own `const SAGE = "#5A7A6A"` (and
// INK, and MUTED), so the brand colour had nineteen definitions and re-theming
// meant finding all of them.
//
// A CSS custom property is legal wherever a colour is: `stroke="var(--sage)"`
// on an SVG element and `style={{ color: "var(--sage)" }}` both resolve. The
// one place it does NOT work is a context that parses the string itself —
// canvas, colour maths, or a library expecting a hex. There is none of that
// here; if one appears, read the computed value rather than reintroducing a
// literal.
//
// PREFER A CLASS. `text-sage` is better than `style={{ color: SAGE }}` because
// it participates in the cascade, hover/focus variants and responsive
// prefixes. Reach for these only when there is no element to put a class on.

export const SAGE = "var(--sage)";
export const SAGE_LIGHT = "var(--sage-light)";
export const SAGE_DEEP = "var(--sage-deep)";
export const SAGE_INK = "var(--sage-ink)";
export const SAGE_WASH = "var(--sage-wash)";

export const INK = "var(--ink)";
export const INK_SOFT = "var(--ink-soft)";
export const BODY = "var(--body)";
export const QUIET = "var(--quiet)";
export const QUIETER = "var(--quieter)";
export const QUIETEST = "var(--quietest)";

export const PAPER = "var(--paper)";
export const BONE = "var(--bone)";
export const RECESSIVE = "var(--recessive)";
export const SHADE = "var(--shade)";
export const LINE = "var(--line)";

export const NIGHT = "var(--night)";
export const OPS = "var(--ops)";

export const POSITIVE = "var(--positive)";
export const WARNING = "var(--warning)";
export const WARNING_INK = "var(--warning-ink)";
export const INFO = "var(--info)";
export const INFO_INK = "var(--info-ink)";
