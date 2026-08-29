// ═══════════════════════════════════════════════════════════════════════════════
// ELEVATION — the drawing plate's generator, ported for the mock
//
// This is `src/components/quote-project/Elevation.tsx` from the customer site,
// arithmetic UNCHANGED: the SIZES table, the frame/glass/mullion geometry, the
// panel defaults, the composite path and the whole 13-family opening-symbol
// library. Two mock-local differences, both stated rather than silent:
//
//  1. No catalogue import. The real component resolves the family through
//     getFamily(getProductBySlug(slug)) and reads family.operation; here the
//     caller passes `op` directly, which is the same string kindFor() would
//     have received. Nothing about the drawing changes.
//  2. One size added — `hero` — because R-49 says the generator is called at
//     the size closest to the intended pixels and never a bigger one scaled
//     down, and the phone hero plate is 320 × 248 (LEARNINGS §1.6). Its
//     viewBox works out at 318 × 246.
//
// The symbol legend, verbatim from the wireframe:
//   solid   sash opens towards you (outward)
//   dashed  sash opens away from you (inward) — tilt-turn and the pivot axis
//   apex of the V points at the HINGE edge
//   single-headed arrow = direction of travel
//   unmarked = fixed
// ═══════════════════════════════════════════════════════════════════════════════

/** Round the way the wireframe does, so paths are byte-comparable with it. */
const q = (v: number) => String(Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
const pos = (v: unknown, fallback: number) => {
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) && x > 0 ? x : fallback;
};

type Hand = "ltr" | "rtl";
type Box = { x: number; y: number; w: number; h: number };

// Padding is ASYMMETRIC and that is the whole point: the left and bottom
// gutters exist to hold the height and width leaders.
//
// viewBox units are kept ≈ rendered px at each size, so leader text lands at a
// real 9–13px on screen and never needs inverse scaling. That is what decides
// WHICH size a caller asks for.
const SIZES = {
  xs: { box: { w: 46, h: 34 }, pad: { l: 3, r: 3, t: 3, b: 3 },
        font: 0, dims: false, inset: 2.4,
        t: { min: 3, max: 4.5, ratio: 0.075 },
        sw: { frame: 1.5, glass: 0.9, sym: 1.3, mull: 1.5, dim: 0.6 }, blades: 4, folds: 2 },
  sm: { box: { w: 124, h: 94 }, pad: { l: 22, r: 6, t: 6, b: 20 },
        font: 9, dims: true, inset: 3,
        t: { min: 3.5, max: 7, ratio: 0.045 },
        sw: { frame: 1.75, glass: 1, sym: 1.25, mull: 1.9, dim: 0.7 }, blades: 5, folds: 3 },
  md: { box: { w: 200, h: 150 }, pad: { l: 34, r: 8, t: 8, b: 30 },
        font: 11, dims: true, inset: 4,
        t: { min: 3, max: 6, ratio: 0.03 },
        sw: { frame: 2, glass: 1.25, sym: 1.25, mull: 2.5, dim: 0.75 }, blades: 6, folds: 3 },
  // R-49: the phone hero is 320 × 248, so it gets its own row rather than an
  // upscaled md or a shrunk lg. 44+262+12 = 318 wide, 12+196+38 = 246 tall.
  hero: { box: { w: 262, h: 196 }, pad: { l: 44, r: 12, t: 12, b: 38 },
        font: 12, dims: true, inset: 5,
        t: { min: 5, max: 10, ratio: 0.03 },
        sw: { frame: 2, glass: 1.25, sym: 1.4, mull: 3, dim: 0.75 }, blades: 6, folds: 3 },
  lg: { box: { w: 372, h: 268 }, pad: { l: 52, r: 14, t: 14, b: 44 },
        font: 13, dims: true, inset: 6,
        t: { min: 6, max: 12, ratio: 0.03 },
        sw: { frame: 2, glass: 1.25, sym: 1.4, mull: 3, dim: 0.75 }, blades: 6, folds: 3 },
} as const;

export type ElevationSize = keyof typeof SIZES;

/** A 45° witness tick, as the wireframe draws them. */
const tick = (x: number, y: number, len: number) =>
  `M${q(x - len)} ${q(y + len)} L${q(x + len)} ${q(y - len)} `;

const fmtMm = (v: number) => String(Math.round(v));

/** Width leader below, height leader up the left edge. */
function DimGroups({ F, S, wMm, hMm }: { F: Box; S: (typeof SIZES)[ElevationSize]; wMm: number; hMm: number }) {
  const fs = S.font;
  const by = F.y + F.h;
  const dimY = by + S.pad.b * 0.68;
  const dimX = F.x - S.pad.l * 0.41;
  const witX = F.x - S.pad.l * 0.65;
  const textX = dimX - 3;
  const rule = { fill: "none", stroke: "currentColor", strokeWidth: q(S.sw.dim), opacity: 0.55 } as const;
  const text = {
    fill: "currentColor", opacity: 0.85, fontSize: q(fs),
    style: { paintOrder: "stroke", stroke: "var(--paper)", strokeWidth: "3px", strokeLinejoin: "round" },
  } as const;
  const wide = wMm / hMm > 2.4;
  const bx = F.x + F.w / 2, bw = Math.max(20, F.w * 0.12);

  return (
    <>
      <g>
        <path {...rule} d={
          `M${q(F.x)} ${q(by + 2)} V${q(dimY + 4)} `
          + `M${q(F.x + F.w)} ${q(by + 2)} V${q(dimY + 4)} `
          + `M${q(F.x)} ${q(dimY)} H${q(F.x + F.w)} `
          + tick(F.x, dimY, 3.5) + tick(F.x + F.w, dimY, 3.5)} />
        <text {...text} className="elev-dim" x={q(F.x + F.w / 2)} y={q(dimY - 3)} textAnchor="middle">{fmtMm(wMm)}</text>
        {wide && (
          <g className="elev-break" aria-hidden="true">
            <rect x={q(bx - bw / 2)} y={q(dimY - 7)} width={q(bw)} height="14" fill="var(--paper)" stroke="none" />
            <path fill="none" stroke="currentColor" opacity={0.55} strokeWidth={q(S.sw.dim + 0.25)}
              strokeLinecap="square" strokeLinejoin="miter"
              d={`M${q(bx - bw / 2)} ${q(dimY)} H${q(bx - bw * 0.2)} L${q(bx - bw * 0.08)} ${q(dimY - 5)} `
                + `L${q(bx + bw * 0.08)} ${q(dimY + 5)} L${q(bx + bw * 0.2)} ${q(dimY)} H${q(bx + bw / 2)}`} />
          </g>
        )}
      </g>
      <g>
        <path {...rule} d={
          `M${q(F.x - 2)} ${q(F.y)} H${q(witX)} `
          + `M${q(F.x - 2)} ${q(F.y + F.h)} H${q(witX)} `
          + `M${q(dimX)} ${q(F.y)} V${q(F.y + F.h)} `
          + tick(dimX, F.y, 3.5) + tick(dimX, F.y + F.h, 3.5)} />
        <text {...text} className="elev-dim" x={q(textX)} y={q(F.y + F.h / 2)} textAnchor="middle"
          transform={`rotate(-90 ${q(textX)} ${q(F.y + F.h / 2)})`}>{fmtMm(hMm)}</text>
      </g>
    </>
  );
}

/** family operation or product name → drawing kind. Tolerates "AMJ80 Series
 *  Awning Window" style strings, exactly as the wireframe does. */
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

/** An operable panel travels towards the nearest fixed panel. */
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
    case "awning":
      return sym(`M${q(L)} ${q(T)} L${q(cx)} ${q(B)} L${q(R)} ${q(T)}`, false, sw);

    case "casement":
    case "hinged":
      return hand === "rtl"
        ? sym(`M${q(L)} ${q(T)} L${q(R)} ${q(cy)} L${q(L)} ${q(B)}`, false, sw)
        : sym(`M${q(R)} ${q(T)} L${q(L)} ${q(cy)} L${q(R)} ${q(B)}`, false, sw);

    case "tilt-turn":
      return <>
        {sym(`M${q(R)} ${q(T)} L${q(L)} ${q(cy)} L${q(R)} ${q(B)}`, true, sw)}
        {sym(`M${q(L)} ${q(T)} L${q(cx)} ${q(B)} L${q(R)} ${q(T)}`, true, sw)}
      </>;

    case "sliding":
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
      if (kind === "lift-slide" && B - T > 34) {
        parts.push(sym(`M${q(cx - 6)} ${q(cy - 12)} L${q(cx)} ${q(cy - 19)} L${q(cx + 6)} ${q(cy - 12)}`, false, sw));
      }
      return <>{parts}</>;
    }

    case "bi-fold":
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

    case "louvre":
      n = Math.max(3, Math.round(pos(o.blades, 6)));
      gap = (B - T) / n;
      d = "";
      for (let k = 0; k <= n; k++) {
        const y = T + k * gap;
        d += `M${q(L)} ${q(y + 1.4)} L${q(R)} ${q(y - 1.4)} `;
      }
      return sym(d.trimEnd(), false, sw * 0.8);

    case "double-hung": {
      n = Math.max(2.5, Math.min(7, (B - T) * 0.1));
      a = Math.max(n + 2, Math.min(20, (cy - T) * 0.66));
      b = Math.max(n + 2, Math.min(20, (B - cy) * 0.66));
      return <>
        {sym(`M${q(L)} ${q(cy)} H${q(R)}`, false, sw)}
        {sym(`M${q(cx)} ${q(T + 2)} V${q(T + 2 + a)} M${q(cx)} ${q(T + 2 + a)} l${q(-n * 0.64)} ${q(-n)} M${q(cx)} ${q(T + 2 + a)} l${q(n * 0.64)} ${q(-n)}`, false, sw)}
        {sym(`M${q(cx)} ${q(B - 2)} V${q(B - 2 - b)} M${q(cx)} ${q(B - 2 - b)} l${q(-n * 0.64)} ${q(n)} M${q(cx)} ${q(B - 2 - b)} l${q(n * 0.64)} ${q(n)}`, false, sw)}
      </>;
    }

    case "single-hung": {
      n = Math.max(2.5, Math.min(7, (B - T) * 0.1));
      a = Math.max(n + 2, Math.min(22, (B - cy) * 0.66));
      return <>
        {sym(`M${q(L)} ${q(cy)} H${q(R)}`, false, sw)}
        {sym(`M${q(cx)} ${q(B - 2)} V${q(B - 2 - a)} M${q(cx)} ${q(B - 2 - a)} l${q(-n * 0.64)} ${q(n)} M${q(cx)} ${q(B - 2 - a)} l${q(n * 0.64)} ${q(n)}`, false, sw)}
      </>;
    }

    case "pivot":
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

export function Elevation({ op, widthMm, heightMm, size = "xs", square = false, dims, parts, axis, opening = false, className = "" }: {
  /** The family's `operation` string, or the product name — whatever the real
   *  component would have handed kindFor(). */
  op?: string;
  /** Draw an OPENING rather than a product: frame and glass, no sash symbol
   *  and no mullions. `parts` still wins. */
  opening?: boolean;
  widthMm?: string | number | null;
  heightMm?: string | number | null;
  size?: ElevationSize;
  /** Draw into a SQUARE frame instead of the opening's true proportion — for a
   *  scan-down list, where a uniform column edge beats true proportion. */
  square?: boolean;
  parts?: { op: string; alongMm: string | number; qty?: number }[];
  axis?: "vertical" | "horizontal" | null;
  dims?: boolean;
  className?: string;
}) {
  const kind = opening ? "fixed" : kindFor(op || "");

  const wMm = pos(widthMm, 1200);
  const hMm = pos(heightMm, 1200);
  const S = SIZES[size] ?? SIZES.xs;

  const panels = Math.max(1, Math.round(defaultPanels(kind, wMm)));
  let pattern = defaultPattern(kind, panels);
  while (pattern.length < panels) pattern += "O";

  // R-49 — leaders NEVER when the size is unknown. A drawing may be
  // indicative; a dimension may not.
  const sized = pos(widthMm, 0) > 0 && pos(heightMm, 0) > 0;
  const showDims = (dims ?? S.dims) && S.font > 0 && sized;
  const pad = showDims ? S.pad : { l: S.pad.r, r: S.pad.r, t: S.pad.r, b: S.pad.r };

  const s = Math.min(S.box.w / wMm, S.box.h / hMm);
  const side = Math.min(S.box.w, S.box.h);
  const iw = square ? side : wMm * s;
  const ih = square ? side : hMm * s;
  const vbw = pad.l + iw + pad.r, vbh = pad.t + ih + pad.b;
  const F: Box = { x: pad.l, y: pad.t, w: iw, h: ih };

  const ratio = kind === "slim-slide" ? S.t.ratio * 0.6 : S.t.ratio;
  const tmin = kind === "slim-slide" ? S.t.min * 0.65 : S.t.min;
  let t = Math.max(tmin, Math.min(S.t.max, iw * ratio));
  t = Math.min(t, Math.min(iw, ih) / 4);
  const G: Box = { x: F.x + t, y: F.y + t, w: F.w - 2 * t, h: F.h - 2 * t };

  const symOpts = { inset: S.inset, sw: S.sw.sym, blades: S.blades, folds: S.folds };
  const pw = G.w / panels;

  // ─── Composite: draw the CHILDREN, not a guess ──────────────────────────────
  const composite = (parts ?? []).flatMap((p) =>
    Array.from({ length: Math.max(1, Math.floor(p.qty ?? 1)) }, () => p));
  const alongTotal = composite.reduce((sum, p) => sum + pos(p.alongMm, 0), 0);
  const stacked = axis === "horizontal";

  const compositeGeometry = composite.length >= 2 && alongTotal > 0
    ? composite.reduce<{ boxes: Box[]; joins: string[]; at: number }>((acc, p, i) => {
      const share = (pos(p.alongMm, 0) / alongTotal) * (stacked ? G.h : G.w);
      acc.boxes.push(stacked
        ? { x: G.x, y: G.y + acc.at, w: G.w, h: share }
        : { x: G.x + acc.at, y: G.y, w: share, h: G.h });
      acc.at += share;
      if (i < composite.length - 1) {
        acc.joins.push(stacked
          ? `M${q(G.x)} ${q(G.y + acc.at)} H${q(G.x + G.w)}`
          : `M${q(G.x + acc.at)} ${q(G.y)} V${q(G.y + G.h)}`);
      }
      return acc;
    }, { boxes: [], joins: [], at: 0 })
    : null;

  const symbols = compositeGeometry
    ? compositeGeometry.boxes.map((box, i) => {
      const partKind = kindFor(composite[i].op);
      const hand: Hand = i < compositeGeometry.boxes.length / 2 ? "ltr" : "rtl";
      return <g key={`c${i}`}>{openingSymbol(partKind, box, hand, symOpts)}</g>;
    })
    : panels === 1 || WHOLE_OPENING[kind]
    ? openingSymbol(kind, G, "ltr", kind === "bi-fold" ? { ...symOpts, folds: panels } : symOpts)
    : pattern.split("").map((ch, i) => {
        if (ch !== "X") return null;                       // fixed = unmarked
        let ph: Hand = "ltr";
        if (kind === "casement" || kind === "hinged") ph = i < panels / 2 ? "ltr" : "rtl";
        else if (kind === "sliding" || kind === "lift-slide" || kind === "slim-slide") ph = travelHand(pattern, i);
        return <g key={i}>{openingSymbol(kind, { x: G.x + pw * i, y: G.y, w: pw, h: G.h }, ph, symOpts)}</g>;
      });

  const mullions = compositeGeometry
    ? compositeGeometry.joins.join(" ")
    : panels > 1
      ? Array.from({ length: panels - 1 }, (_, i) => `M${q(G.x + pw * (i + 1))} ${q(G.y)} V${q(G.y + G.h)}`).join(" ")
      : "";

  return (
    <svg data-elevation="" data-unsized={sized ? undefined : ""}
      data-opening={opening && !compositeGeometry ? "" : undefined}
      data-wide={wMm / hMm > 2.4 ? "1" : undefined}
      viewBox={`0 0 ${q(vbw)} ${q(vbh)}`} width={q(vbw)} height={q(vbh)}
      className={className} aria-hidden="true" fill="none"
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
      {showDims && <DimGroups F={F} S={S} wMm={wMm} hMm={hMm} />}
    </svg>
  );
}

/** The legend, shown only where the drawing is the subject (the expanded lg
 *  plate). Never on the hero — a 320px plate has no room to teach. */
export function ElevationLegend() {
  return (
    <dl className="elev-legend">
      <div><dt>solid V</dt><dd>opens towards you</dd></div>
      <div><dt>dashed V</dt><dd>opens away from you</dd></div>
      <div><dt>apex</dt><dd>points at the hinge edge</dd></div>
      <div><dt>arrow</dt><dd>direction of travel</dd></div>
      <div><dt>unmarked</dt><dd>fixed</dd></div>
    </dl>
  );
}
