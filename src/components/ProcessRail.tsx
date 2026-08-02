// ═══════════════════════════════════════════════════════════════════════════════
// PROCESS RAIL — the money arc, drawn
//
// SCAFFOLD. Geometry and structure are in place; every text label, the dotted
// droppers and the final typography are still TODO. See the markers below.
//
// One rail carries three facts that /how-it-works otherwise asks the reader to
// assemble from three separate places:
//
//  • YOUR SIX STEPS, in order, above the rail — Upload, Submit, Accept, Sign
//    off, Pay, Confirm. Six nodes are six by inspection, so the page still
//    states no total anywhere and cannot drift on a hand-written count.
//  • THE THREE PHASES, on the rail, each carrying the percentage paid at that
//    point. Scrolling used to turn the 0/50/100 arc into three numbers a screen
//    apart; here it is one drawing.
//  • THE LINE — a dashed vertical at the threshold, NOTHING CHARGED to its
//    left, INVOICE EXISTS to its right. The single most commercially important
//    sentence on the site, as a position rather than a paragraph.
//
// There is deliberately NO progress bar on this page. The prototype's rail
// grows a sage bar to the paid position, which is right on an order-tracking
// view where a real order has a real position — here there is no order, so an
// arc drawn as "0% complete" would be answering a question nobody asked. The
// three node percentages carry the money instead.
//
// Two SVGs, one component. Below md the horizontal rail cannot hold six labelled
// nodes at 375px, so a vertical variant takes over — same facts, same order,
// stacked. Both are always in the DOM and CSS chooses; that keeps the swap free
// of layout measurement and it is what the site already does elsewhere.
//
// COLOURS ARE TOKENS, never hex — an SVG stroke/fill accepts var(--…) and
// styles/tokens.ts exists precisely so the palette has one home. See its header.
// ═══════════════════════════════════════════════════════════════════════════════

/** Your six steps. The labels are the same verbs the page uses in prose. */
const STEPS = [
  { n: "01", label: "Upload" },
  { n: "02", label: "Submit" },
  { n: "03", label: "Accept" },
  { n: "04", label: "Sign off" },
  { n: "05", label: "Pay" },
  { n: "06", label: "Confirm" },
] as const;

/** The three phases, with the percentage paid ON ARRIVAL at each one. These are
 *  the page's own numbers — PHASES in HowItWorksPage.tsx states the same three,
 *  and the two must not drift. */
const PHASES = [
  { num: "01", pct: "0%", word: "Quote", sub: "about 1 minute", note: "nothing charged" },
  { num: "02", pct: "50%", word: "Order", sub: "about 3–4 weeks", note: "deposit paid" },
  { num: "03", pct: "100%", word: "Delivery", sub: "about 2 weeks", note: "paid in full" },
] as const;

// ─── Geometry ────────────────────────────────────────────────────────────────
// Carried over from the prototype's own layout. Step positions are NOT evenly
// spaced: 01/02 sit before the threshold, 03 crosses it, 04/05 fall inside
// phases 02–03 and 06 lands after the balance is paid — so the spacing is
// itself a statement about when each step happens.
// TODO(scaffold): re-tune once the real labels are in. Production type is a
// different size to the prototype's, so collisions will move.

const H = {
  viewBox: "0 0 800 186",
  x0: 60, x1: 700, tail: 764, y: 96,
  nodeX: [60, 380, 700],
  stepX: [148, 252, 336, 480, 620, 748],
} as const;

const V = {
  viewBox: "0 0 320 546",
  x: 34, y0: 44, y1: 452, tail: 520, textX: 62,
  nodeY: [44, 272, 452],
  stepY: [110, 158, 206, 336, 392, 500],
} as const;

/** The whole diagram as one sentence, for anyone who never sees it. Derived from
 *  the data above so it cannot fall out of step with what is drawn. */
function railDescription() {
  const phases = PHASES
    .map((p, i) => `Phase ${i + 1} ${p.word}, ${p.pct.replace("%", "")} per cent paid, ${p.sub}.`)
    .join(" ");
  const steps = STEPS.map((s) => s.label).join(", ");
  return `Three phases. ${phases} Your six steps: ${steps}. ` +
    "Nothing is charged before you accept a reviewed quote.";
}

// ─── Horizontal (md and up) ──────────────────────────────────────────────────
function HorizontalRail({ titleId }: { titleId: string }) {
  // Phase labels: the first is left-aligned because a centred label under the
  // first node would hang off the left edge of the viewBox.
  const anchors: ("start" | "middle")[] = ["start", "middle", "middle"];
  const labelX = [H.x0 - 12, H.nodeX[1], H.nodeX[2]];

  return (
    <svg viewBox={H.viewBox} className="hidden md:block w-full h-auto max-w-[960px] overflow-visible"
      role="img" aria-labelledby={titleId} fill="none">
      <title id={titleId}>{railDescription()}</title>

      {/* The rail itself, running past the last phase to an open arrowhead —
          delivery is the end of THIS process, not the end of the relationship. */}
      <path className="rail-track" d={`M${H.x0} ${H.y} H${H.tail}`} stroke="var(--line)" strokeWidth={2} />
      <path d={`M${H.tail - 8} ${H.y - 5} L${H.tail} ${H.y} L${H.tail - 8} ${H.y + 5}`}
        stroke="var(--line)" strokeWidth={2} />

      {/* Your six steps, above the rail. Each is a SQUARE carrying its numeral,
          on a dotted dropper down to the point on the rail where it happens.
          The spacing is not even: 01 and 02 fall before the threshold, 03
          crosses it, 04 and 05 sit inside phases 02–03, and 06 lands after the
          balance is paid — so the gaps are themselves a claim about timing. */}
      {STEPS.map((s, i) => (
        <g key={s.n}>
          <path d={`M${H.stepX[i]} 50 V${H.y - 14}`} stroke="var(--line)" strokeWidth={1} strokeDasharray="2 3" />
          <rect x={H.stepX[i] - 9} y={18} width={18} height={18}
            fill="var(--recessive)" stroke="var(--ink)" strokeWidth={1.25} />
          <text x={H.stepX[i]} y={31} textAnchor="middle" fontSize={10} className="rail-num">{s.n}</text>
          <text x={H.stepX[i]} y={47} textAnchor="middle" fontSize={13} className="rail-step">{s.label}</text>
        </g>
      ))}

      {/* THE LINE. Everything left of it is free — the same threshold the dark
          band further down the page states in words. */}
      <path d={`M${H.nodeX[1]} 60 V${H.y + 18}`} stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={H.nodeX[1] - 6} y={70} textAnchor="end" fontSize={9} className="rail-dim">NOTHING CHARGED</text>
      <text x={H.nodeX[1] + 6} y={70} textAnchor="start" fontSize={9} className="rail-dim">INVOICE EXISTS</text>

      {/* The three phase nodes, ON the rail: a heavier square than a step,
          because a phase is a place you arrive at rather than a thing you do. */}
      {PHASES.map((p, i) => (
        <g key={p.num}>
          <rect x={H.nodeX[i] - 12} y={H.y - 12} width={24} height={24}
            fill="var(--recessive)" stroke="var(--ink)" strokeWidth={2} />
          <text x={H.nodeX[i]} y={H.y + 4} textAnchor="middle" fontSize={11} className="rail-num">{p.num}</text>
          <text x={labelX[i]} y={H.y + 34} textAnchor={anchors[i]} fontSize={16} className="rail-pct">{p.pct}</text>
          <text x={labelX[i]} y={H.y + 50} textAnchor={anchors[i]} fontSize={10} className="rail-dim">
            {`PHASE ${p.num} · ${p.word.toUpperCase()}`}
          </text>
          <text x={labelX[i]} y={H.y + 64} textAnchor={anchors[i]} fontSize={11} className="rail-sub">{p.sub}</text>
          <text x={labelX[i]} y={H.y + 78} textAnchor={anchors[i]} fontSize={9} className="rail-dim">
            {p.note.toUpperCase()}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Vertical (below md) ─────────────────────────────────────────────────────
function VerticalRail({ titleId }: { titleId: string }) {
  return (
    <svg viewBox={V.viewBox} className="md:hidden w-full h-auto max-w-[360px] overflow-visible"
      role="img" aria-labelledby={titleId} fill="none">
      <title id={titleId}>{railDescription()}</title>

      <path className="rail-track" d={`M${V.x} ${V.y0} V${V.tail}`} stroke="var(--line)" strokeWidth={2} />
      <path d={`M${V.x - 5} ${V.tail - 8} L${V.x} ${V.tail} L${V.x + 5} ${V.tail - 8}`}
        stroke="var(--line)" strokeWidth={2} />

      {/* Same squares, same order, stacked — the labels move to the right of
          the rail because a 375px column cannot hold six of them across. */}
      {STEPS.map((s, i) => (
        <g key={s.n}>
          <rect x={V.x - 9} y={V.stepY[i] - 9} width={18} height={18}
            fill="var(--recessive)" stroke="var(--ink)" strokeWidth={1.25} />
          <text x={V.x} y={V.stepY[i] + 4} textAnchor="middle" fontSize={10} className="rail-num">{s.n}</text>
          <text x={V.textX} y={V.stepY[i] + 5} textAnchor="start" fontSize={14} className="rail-step">{s.label}</text>
        </g>
      ))}

      {/* THE LINE, drawn across the column between phase 01 and phase 02. */}
      <path d="M6 232 H300" stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={300} y={224} textAnchor="end" fontSize={9} className="rail-dim">NOTHING CHARGED ABOVE</text>
      <text x={300} y={246} textAnchor="end" fontSize={9} className="rail-dim">INVOICE EXISTS BELOW</text>

      {PHASES.map((p, i) => (
        <g key={p.num}>
          <rect x={V.x - 12} y={V.nodeY[i] - 12} width={24} height={24}
            fill="var(--recessive)" stroke="var(--ink)" strokeWidth={2} />
          <text x={V.x} y={V.nodeY[i] + 4} textAnchor="middle" fontSize={11} className="rail-num">{p.num}</text>
          <text x={V.textX} y={V.nodeY[i] - 8} textAnchor="start" fontSize={16} className="rail-pct">{p.pct}</text>
          <text x={V.textX} y={V.nodeY[i] + 7} textAnchor="start" fontSize={10} className="rail-dim">
            {`PHASE ${p.num} · ${p.word.toUpperCase()}`}
          </text>
          <text x={V.textX} y={V.nodeY[i] + 21} textAnchor="start" fontSize={11} className="rail-sub">
            {`${p.sub} · ${p.note}`}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** The rail. Renders both orientations; CSS picks one. */
export function ProcessRail({ className = "" }: { className?: string }) {
  return (
    <div className={`process-rail ${className}`}>
      <HorizontalRail titleId="process-rail-h" />
      <VerticalRail titleId="process-rail-v" />
    </div>
  );
}
