// ═══════════════════════════════════════════════════════════════════════════════
// ELEVATION — the opening, drawn to its real proportions
//
// A direct port of the wireframe's `OF.svg.elevation()` at its `xs` size: the
// SIZES table, the frame/glass/mullion geometry, the panel defaults and the
// whole 13-family opening-symbol library, arithmetic unchanged. It replaces the
// per-family pictogram, which was a generic glyph at a fixed 22×22 square.
//
// Two things the port buys that a family glyph cannot:
//
//  • TRUE PROPORTION. The box is scaled by min(boxW/wMm, boxH/hMm) on BOTH axes,
//    so a 3500×700 opening draws as the long slot it is and a 700×1800 as the
//    tall one. The row shows the shape of the thing, not a category badge.
//  • THE ACTUAL ARRANGEMENT. Panel count and pattern derive from the kind and
//    the width, mullions are drawn, and the opening symbol lands on the real
//    hinge edge of the real panel rather than in the middle of a square.
//
// The symbol legend, verbatim from the wireframe:
//   solid   sash opens towards you (outward)
//   dashed  sash opens away from you (inward) — tilt-turn and the pivot axis
//   apex of the V points at the HINGE edge
//   single-headed arrow = direction of travel
//   unmarked = fixed
// ═══════════════════════════════════════════════════════════════════════════════
import { getProductBySlug, getFamily } from "../../data/catalogue";

/** Round the way the wireframe does, so paths are byte-comparable with it. */
const q = (v: number) => String(Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
const pos = (v: unknown, fallback: number) => {
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) && x > 0 ? x : fallback;
};

type Hand = "ltr" | "rtl";
type Box = { x: number; y: number; w: number; h: number };

// The wireframe's SIZES table, verbatim, for the drawing parameters. All four
// are here rather than just the row's `xs` because this is a generator, not a
// row glyph — a product card, a detail page or a review line can ask for a
// bigger one without a second implementation appearing.
//
// NOT ported: the dimension leaders, the reference label and the "indicative
// arrangement" caption that the wireframe draws at sm and above. Those need
// dimGroups() and are only meaningful where the drawing is the subject rather
// than an identifier, so they can follow the first caller that wants them.
const SIZES = {
  xs: { box: { w: 46, h: 34 }, pad: 3, inset: 2.4,
        t: { min: 3, max: 4.5, ratio: 0.075 },
        sw: { frame: 1.5, glass: 0.9, sym: 1.3, mull: 1.5 }, blades: 4, folds: 2 },
  sm: { box: { w: 124, h: 94 }, pad: 6, inset: 3,
        t: { min: 3.5, max: 7, ratio: 0.045 },
        sw: { frame: 1.75, glass: 1, sym: 1.25, mull: 1.9 }, blades: 5, folds: 3 },
  md: { box: { w: 200, h: 150 }, pad: 8, inset: 4,
        t: { min: 3, max: 6, ratio: 0.03 },
        sw: { frame: 2, glass: 1.25, sym: 1.25, mull: 2.5 }, blades: 6, folds: 3 },
  lg: { box: { w: 372, h: 268 }, pad: 14, inset: 6,
        t: { min: 6, max: 12, ratio: 0.03 },
        sw: { frame: 2, glass: 1.25, sym: 1.4, mull: 3 }, blades: 6, folds: 3 },
} as const;

export type ElevationSize = keyof typeof SIZES;

/** family slug or product name → drawing kind. Tolerates "AMJ80 Series Awning
 *  Window" style strings, exactly as the wireframe does. */
export function kindFor(family: string): string {
  const f = String(family || "").toLowerCase().trim();
  const keys = ["tilt-turn", "double-hung", "single-hung", "bi-fold", "lift-slide",
    "slim-slide", "louvre", "pivot", "awning", "casement", "sliding", "hinged", "fixed"];
  for (const k of keys) if (f.includes(k)) return k;
  if (/louver/.test(f)) return "louvre";
  if (/bifold/.test(f)) return "bi-fold";
  return "fixed";
}

/** Vertical divisions only — hung families carry both sashes inside the symbol. */
function defaultPanels(kind: string, wMm: number): number {
  if (kind === "sliding") return wMm > 3600 ? 4 : 2;
  if (kind === "lift-slide" || kind === "slim-slide") return 2;
  if (kind === "bi-fold") return wMm > 3600 ? 4 : 3;
  return 1;
}

function defaultPattern(kind: string, panels: number): string {
  if (kind === "fixed") return "O".repeat(panels);
  if (panels === 1) return "X";
  if (kind === "sliding" || kind === "lift-slide" || kind === "slim-slide") {
    if (panels === 2) return "XO";
    if (panels === 3) return "XOX";
    if (panels === 4) return "OXXO";
    return "X" + "O".repeat(panels - 1);
  }
  return "X".repeat(panels);
}

/** An operable panel travels towards the nearest fixed panel — the rule an XO,
 *  an XOX and an OXXO all obey. */
function travelHand(pattern: string, i: number): Hand {
  let l = -1, r = -1;
  for (let k = i - 1; k >= 0; k--) if (pattern.charAt(k) === "O") { l = k; break; }
  for (let k = i + 1; k < pattern.length; k++) if (pattern.charAt(k) === "O") { r = k; break; }
  if (r !== -1 && (l === -1 || r - i <= i - l)) return "ltr";
  if (l !== -1) return "rtl";
  return i < pattern.length / 2 ? "ltr" : "rtl";
}

/** Symbols that describe the whole opening rather than one leaf. */
const WHOLE_OPENING: Record<string, true> = { "bi-fold": true, "double-hung": true, "single-hung": true };

let seq = 0;
const sym = (d: string, dashed: boolean, sw: number) => (
  <path key={`s${seq++}`} d={d} fill="none" stroke="currentColor" strokeWidth={q(sw)}
    strokeDasharray={dashed ? "4 3" : undefined}
    strokeLinecap="square" strokeLinejoin="miter" />
);

/** The opening-symbol library — computed geometry, not scaled sprites, so the
 *  apex always lands on the real hinge edge of the real panel. */
function openingSymbol(kind: string, p: Box, hand: Hand, o: { inset: number; sw: number; blades: number; folds: number }) {
  const i = o.inset, sw = o.sw;
  const L = p.x + i, R = p.x + p.w - i, T = p.y + i, B = p.y + p.h - i;
  if (R - L < 4 || B - T < 4) return null;
  const cx = (L + R) / 2, cy = (T + B) / 2;
  let n: number, d: string, step: number, gap: number, a: number, b: number, rr: number, dir: number, x1: number, x2: number;

  switch (kind) {
    case "awning":                       // top-hung, outward. Apex on the TOP rail.
      return sym(`M${q(L)} ${q(B)} L${q(cx)} ${q(T)} L${q(R)} ${q(B)}`, false, sw);

    case "casement":                     // side-hung, outward. Apex on the hinge stile.
    case "hinged":
      return hand === "rtl"
        ? sym(`M${q(L)} ${q(T)} L${q(R)} ${q(cy)} L${q(L)} ${q(B)}`, false, sw)
        : sym(`M${q(R)} ${q(T)} L${q(L)} ${q(cy)} L${q(R)} ${q(B)}`, false, sw);

    case "tilt-turn":                    // side-hung + bottom-hung, both INWARD.
      return <>
        {sym(`M${q(R)} ${q(T)} L${q(L)} ${q(cy)} L${q(R)} ${q(B)}`, true, sw)}
        {sym(`M${q(L)} ${q(T)} L${q(cx)} ${q(B)} L${q(R)} ${q(T)}`, true, sw)}
      </>;

    case "sliding":                      // single-headed travel arrow.
    case "lift-slide":
    case "slim-slide": {
      dir = hand === "rtl" ? -1 : 1;
      x1 = dir > 0 ? L + 3 : R - 3;
      x2 = dir > 0 ? R - 3 : L + 3;
      n = Math.max(3, Math.min(7, (R - L) * 0.09));
      const parts = [
        sym(`M${q(x1)} ${q(cy)} H${q(x2)}`, false, sw),
        sym(`M${q(x2)} ${q(cy)} l${q(-n * dir)} ${q(-n * 0.7)} M${q(x2)} ${q(cy)} l${q(-n * dir)} ${q(n * 0.7)}`, false, sw),
      ];
      // lift-slide adds the "lift" chevron above the travel arrow
      if (kind === "lift-slide" && B - T > 34) {
        parts.push(sym(`M${q(cx - 6)} ${q(cy - 12)} L${q(cx)} ${q(cy - 19)} L${q(cx + 6)} ${q(cy - 12)}`, false, sw));
      }
      return <>{parts}</>;
    }

    case "bi-fold":                      // concertina, alternating apexes.
      n = Math.max(2, Math.round(pos(o.folds, 3)));
      step = (R - L) / n;
      d = "";
      for (let k = 0; k < n; k++) {
        a = L + k * step; b = a + step;
        d += k % 2 === 0
          ? `M${q(a)} ${q(T)} L${q(b)} ${q(cy)} L${q(a)} ${q(B)} `
          : `M${q(b)} ${q(T)} L${q(a)} ${q(cy)} L${q(b)} ${q(B)} `;
      }
      return sym(d.trimEnd(), false, sw);

    case "louvre":                       // blades across the glass, slight rake.
      n = Math.max(3, Math.round(pos(o.blades, 6)));
      gap = (B - T) / n;
      d = "";
      for (let k = 0; k <= n; k++) {
        const y = T + k * gap;
        d += `M${q(L)} ${q(y + 1.4)} L${q(R)} ${q(y - 1.4)} `;
      }
      return sym(d.trimEnd(), false, sw * 0.8);

    case "double-hung": {                // both sashes move: top DOWN, bottom UP.
      n = Math.max(2.5, Math.min(7, (B - T) * 0.1));
      a = Math.max(n + 2, Math.min(20, (cy - T) * 0.66));
      b = Math.max(n + 2, Math.min(20, (B - cy) * 0.66));
      return <>
        {sym(`M${q(L)} ${q(cy)} H${q(R)}`, false, sw)}
        {sym(`M${q(cx)} ${q(T + 2)} V${q(T + 2 + a)} M${q(cx)} ${q(T + 2 + a)} l${q(-n * 0.64)} ${q(-n)} M${q(cx)} ${q(T + 2 + a)} l${q(n * 0.64)} ${q(-n)}`, false, sw)}
        {sym(`M${q(cx)} ${q(B - 2)} V${q(B - 2 - b)} M${q(cx)} ${q(B - 2 - b)} l${q(-n * 0.64)} ${q(n)} M${q(cx)} ${q(B - 2 - b)} l${q(n * 0.64)} ${q(n)}`, false, sw)}
      </>;
    }

    case "single-hung": {                // bottom sash only; top unmarked = fixed.
      n = Math.max(2.5, Math.min(7, (B - T) * 0.1));
      a = Math.max(n + 2, Math.min(22, (B - cy) * 0.66));
      return <>
        {sym(`M${q(L)} ${q(cy)} H${q(R)}`, false, sw)}
        {sym(`M${q(cx)} ${q(B - 2)} V${q(B - 2 - a)} M${q(cx)} ${q(B - 2 - a)} l${q(-n * 0.64)} ${q(n)} M${q(cx)} ${q(B - 2 - a)} l${q(n * 0.64)} ${q(n)}`, false, sw)}
      </>;
    }

    case "pivot":                        // dashed axis + rotation arc + pin.
      rr = Math.min(p.w, p.h) / 3.2;
      return <>
        {sym(`M${q(cx)} ${q(T)} V${q(B)}`, true, sw)}
        <path key="arc" d={`M${q(cx - rr)} ${q(cy)} A${q(rr)} ${q(rr)} 0 0 1 ${q(cx)} ${q(cy - rr)}`}
          fill="none" stroke="currentColor" strokeWidth={q(sw)} strokeLinecap="square" strokeLinejoin="miter" />
        {sym(`M${q(cx)} ${q(cy - rr)} l-5 -1 M${q(cx)} ${q(cy - rr)} l-1 5`, false, sw)}
        <circle key="pin" cx={q(cx)} cy={q(cy)} r="1.6" fill="currentColor" />
      </>;

    case "fixed":
    default:
      return null;                       // unmarked, per the legend
  }
}

export function Elevation({ productSlug, widthMm, heightMm, size = "xs", className = "" }: {
  productSlug: string;
  /** The opening's real dimensions. Absent or unreadable falls back to 1200×1200,
   *  which draws a square — honest for a line whose size we do not yet know. */
  widthMm?: string | number | null;
  heightMm?: string | number | null;
  size?: ElevationSize;
  className?: string;
}) {
  const family = getFamily(getProductBySlug(productSlug)?.familySlug ?? "");
  const kind = kindFor(family?.operation || family?.slug || productSlug);

  const wMm = pos(widthMm, 1200);
  const hMm = pos(heightMm, 1200);
  const S = SIZES[size] ?? SIZES.xs;

  const panels = Math.max(1, Math.round(defaultPanels(kind, wMm)));
  let pattern = defaultPattern(kind, panels);
  while (pattern.length < panels) pattern += "O";

  // True relative proportion — the same scale on both axes.
  const s = Math.min(S.box.w / wMm, S.box.h / hMm);
  const iw = wMm * s, ih = hMm * s;
  const vbw = S.pad * 2 + iw, vbh = S.pad * 2 + ih;
  const F: Box = { x: S.pad, y: S.pad, w: iw, h: ih };

  // Drawn frame section thickness.
  const ratio = kind === "slim-slide" ? S.t.ratio * 0.6 : S.t.ratio;
  const tmin = kind === "slim-slide" ? S.t.min * 0.65 : S.t.min;
  let t = Math.max(tmin, Math.min(S.t.max, iw * ratio));
  t = Math.min(t, Math.min(iw, ih) / 4);
  const G: Box = { x: F.x + t, y: F.y + t, w: F.w - 2 * t, h: F.h - 2 * t };

  const symOpts = { inset: S.inset, sw: S.sw.sym, blades: S.blades, folds: S.folds };
  const pw = G.w / panels;

  const mullions = panels > 1
    ? Array.from({ length: panels - 1 }, (_, i) => `M${q(G.x + pw * (i + 1))} ${q(G.y)} V${q(G.y + G.h)}`).join(" ")
    : "";

  const symbols = panels === 1 || WHOLE_OPENING[kind]
    ? openingSymbol(kind === "bi-fold" ? kind : kind, G, "ltr",
        kind === "bi-fold" ? { ...symOpts, folds: panels } : symOpts)
    : pattern.split("").map((ch, i) => {
        if (ch !== "X") return null;                       // fixed = unmarked
        let ph: Hand = "ltr";
        if (kind === "casement" || kind === "hinged") ph = i < panels / 2 ? "ltr" : "rtl";
        else if (kind === "sliding" || kind === "lift-slide" || kind === "slim-slide") ph = travelHand(pattern, i);
        return <g key={i}>{openingSymbol(kind, { x: G.x + pw * i, y: G.y, w: pw, h: G.h }, ph, symOpts)}</g>;
      });

  return (
    // data-elevation marks this as the generated drawing. The rows it sits in
    // also carry lucide glyphs, and those are svgs with a viewBox too — without
    // a handle, "the elevation" is not addressable from a test or a style.
    <svg data-elevation="" viewBox={`0 0 ${q(vbw)} ${q(vbh)}`} className={className} aria-hidden="true" fill="none"
      preserveAspectRatio="xMidYMid meet">
      <rect x={q(F.x)} y={q(F.y)} width={q(F.w)} height={q(F.h)} rx="1"
        fill="none" stroke="currentColor" strokeWidth={q(S.sw.frame)} />
      <rect x={q(G.x)} y={q(G.y)} width={q(G.w)} height={q(G.h)} rx="0.5"
        fill="none" stroke="currentColor" strokeWidth={q(S.sw.glass)} />
      {mullions && (
        <path d={mullions} fill="none" stroke="currentColor" strokeWidth={q(S.sw.mull)}
          strokeLinecap="square" strokeLinejoin="miter" opacity="0.75" />
      )}
      {symbols}
    </svg>
  );
}
