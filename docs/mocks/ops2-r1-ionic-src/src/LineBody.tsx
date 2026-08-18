// ═══════════════════════════════════════════════════════════════════════════════
// THE LINE BODY — the plate, the verdict index, and five open sections
//
// CRITIQUE 1 and the disclosure ruling both land here, and together they close
// off two answers, not one:
//
//   • a lens CHIP STRIP is out — at 390px the five chips measure ≈435px, and
//     R-68 deliberately let the fifth be cut so the strip would "read as
//     scrollable". Nothing may require a sideways scroll to reach a destination.
//   • an ACCORDION is out — "don't like the approach. not great UX pattern."
//     Right on the merits: it hides content behind clicks, defeats scanning, and
//     shifts the layout under the pointer. In a console whose whole job is seeing
//     the state of a line at a glance, that is backwards.
//
// So the sections are simply OPEN. All five, in R-43's fixed order, in one
// vertical column, nothing to press before anything can be read. A phone scrolls
// vertically for free; that was never the scarce axis.
//
// What the chip strip was actually FOR was glanceability — five verdicts in one
// look — and losing that would be a real loss, so it is paid for separately by
// the VERDICT INDEX directly under the plate: five name/verdict pairs in a
// wrapping grid, each an in-page link to its section. It hides nothing (the full
// section is below in the flow), it wraps rather than scrolls, and it is an index
// rather than a control.
//
// Rules, and what each becomes:
//   R-43  identical set and order on every line. KEPT — the section headings are
//         the anchors the chips used to be. There is nothing left to collapse, so
//         "pressing the active chip collapses it" has no referent.
//   R-44  a panel that failed to load says so in its own heading. KEPT, and it is
//         now strictly stronger: a failure cannot be collapsed out of sight
//         because nothing collapses.
//   R-45  verdicts come from real fields — never confidence_band; Trail carries
//         the NOTE count, never an event count. KEPT.
//   R-47  the arrival walk. CHANGED IN KIND: it used to expand the first section
//         that matched. With nothing to expand, the walk becomes a MARK rather
//         than a movement — the section and its index row are toned, and the
//         reviewer's eye goes there without the page moving or the plate being
//         scrolled away. That is the same intent with no hidden state.
//   R-48  session memory of what a human opened or closed. GONE, with the
//         mechanism it governed. Nothing to remember.
// ═══════════════════════════════════════════════════════════════════════════════
import { IonButton, IonNote } from "@ionic/react";
import { Plate } from "./Plate";
import { CANDIDATES, LENS_NAMES, RECORD, type Lens, type Line } from "./data";
import { Money, mm } from "./ui";
import type { ElevationSize } from "./elevation";

/** R-47 — one list, evaluated in order, first match wins. It now decides what is
 *  MARKED, not what is shown. */
export function attentionSection(line: Line): string | null {
  const failed = line.lenses.find((l) => l.failed);
  if (failed) return failed.key;
  if (!line.requirementMet) return "glass";
  if (line.priceCents === null) return "price";
  if (line.flags.length > 0) return "build";
  return null;
}

const toneOf = (l: Lens) => (l.failed ? "danger" : l.tone === "attention" ? "warning" : undefined);

/** The verdict index — what the chip strip was for, without the strip. */
function Verdicts({ line }: { line: Line }) {
  return (
    <nav className="verdicts" aria-label={`Sections on ${line.code}`}>
      {line.lenses.map((l) => (
        <a key={l.key} href={`#sec-${l.key}`} data-tone={toneOf(l)}>
          <span className="vn">{LENS_NAMES[l.key]}</span>
          <span className="vv">{l.verdict}</span>
        </a>
      ))}
    </nav>
  );
}

function Section({ line, lens }: { line: Line; lens: Lens }) {
  const tone = toneOf(lens);
  return (
    <section className="section" id={`sec-${lens.key}`} data-tone={tone}
      aria-label={LENS_NAMES[lens.key]}>
      <h2>
        {LENS_NAMES[lens.key]}
        <span className="sv">{lens.verdict}</span>
      </h2>
      <Body line={line} k={lens.key} failed={!!lens.failed} />
    </section>
  );
}

function Body({ line, k, failed }: { line: Line; k: Lens["key"]; failed: boolean }) {
  if (failed) {
    /* R-44 — and `danger` rather than `warning`, because this is not a decision
       of ours to resolve: a read did not happen, and nothing on this section can
       proceed until it does. Rule A2 keeps the two apart. */
    return (
      <>
        <p>This section could not be read. Everything else on the line is current.</p>
        <IonButton size="small" fill="outline" color="danger">Try again</IonButton>
      </>
    );
  }

  if (k === "why") {
    return (
      <>
        {/* D8 — words and data, not drawings, and the absent visual is stated
            rather than left blank. */}
        <dl className="kv">
          <div><dt>Chosen because</dt><dd>{line.basis}</dd></div>
          <div><dt>Requirement</dt><dd>{line.requirement}</dd></div>
          <div><dt>Source</dt><dd>Uploaded schedule · no page reference recorded</dd></div>
        </dl>
        <p className="quote">
          {line.product} in {line.frame} with {line.glazing} — the nearest product in
          the catalogue that satisfies the stated Uw and SHGC at this size.
        </p>
        {/* D9 — the losing candidates, ranked, with reasons. Visible, not behind
            a disclosure: four rows cost less than the click did. */}
        <table className="cands">
          <caption>Ranked against {CANDIDATES.length - 1} alternatives</caption>
          <thead>
            <tr><th className="r" scope="col">#</th><th scope="col">Product</th>
              <th scope="col">Verdict</th><th scope="col">Why</th></tr>
          </thead>
          <tbody>
            {CANDIDATES.map((c) => (
              <tr key={c.rank} data-chosen={c.verdict === "chosen" ? "" : undefined}
                data-fails={c.verdict.startsWith("fails") ? "" : undefined}>
                <td className="r">{c.rank}</td>
                <td>{c.name}</td>
                <td className="v">{c.verdict}</td>
                <td className="why">{c.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <IonNote className="fact basis" style={{ display: "block", marginTop: 6 }}>
          No price is stored against a candidate — the ranking is thermal and dimensional only.
        </IonNote>
      </>
    );
  }

  if (k === "glass") {
    return (
      <>
        <dl className="kv">
          <div><dt>Requirement</dt><dd>{line.requirement}</dd></div>
          <div><dt>This product</dt>
            <dd>{line.requirementMet ? "Uw 3.7 · SHGC 0.41" : "Uw 4.1 · SHGC 0.52"}</dd></div>
          <div><dt>Glazing</dt><dd>{line.glazing}</dd></div>
        </dl>
        {!line.requirementMet && (
          /* C4 / rule A2 — WARNING, never danger, and never a gate. It states the
             divergence, says who decides, and offers nothing to acknowledge. */
          <div className="note-warning" role="note">
            <b className="lede">This does not meet the stated requirement.</b>
            Yours is the decision. The divergence is recorded once, on the quote,
            when you issue it — nothing is recorded now and nothing is blocked.
          </div>
        )}
      </>
    );
  }

  if (k === "build") {
    return (
      <>
        {line.parts ? (
          <>
            <p>
              Made as {line.parts.reduce((n, p) => n + (p.qty ?? 1), 0)} units, joined{" "}
              {line.axis === "horizontal" ? "one above the other" : "side by side"}.
            </p>
            <ul className="units">
              {line.parts.map((p) => <li key={p.label}>{p.label}</li>)}
            </ul>
          </>
        ) : (
          <p>One unit. ×{line.qty} on this line.</p>
        )}
        {line.flags.map((f) => (
          <div key={f} className="note-warning" role="note">{f}</div>
        ))}
      </>
    );
  }

  if (k === "price") {
    return (
      <>
        <dl className="kv">
          <div><dt>This line</dt>
            <dd><Money cents={line.priceCents} absent="no rate for this configuration" /></dd></div>
          <div><dt>Quantity</dt><dd>×{line.qty}</dd></div>
        </dl>
        {line.priceCents === null ? (
          /* R-66 — a price that refuses is correct behaviour, and the console
             says WHICH number is missing, in full. Warning, not danger: these are
             rates we can go and get. */
          <div className="note-warning" role="note">
            <b className="lede">Missing rates:</b>
            <ul>
              <li>{line.frame} · {line.glazing} · rate band 1,800–2,400 mm high</li>
              <li>Zone 4 — Outer metro delivery rate</li>
            </ul>
          </div>
        ) : (
          <IonNote className="fact basis" style={{ display: "block" }}>
            {/* "estimate" is struck project-wide: the owner asked for it, and the
                glossary puts the word on Quote's own _Avoid_ line because the
                estimator is a different concept. */}
            {line.qty > 1 ? "line total for all units · " : ""}{RECORD.gstMode} · this account's setting
          </IonNote>
        )}
      </>
    );
  }

  /* R-45 — Trail's verdict is the NOTE count, never an event count. */
  return (
    <>
      {line.notes.length === 0 ? (
        <p className="absent">
          No notes on this line yet. A note added here is stored against {line.code} and
          shows against it thereafter.
        </p>
      ) : (
        line.notes.map((n, i) => (
          <div key={i} className="note-item">
            <div className="who">{n.who}</div>
            <div className="body">{n.body}</div>
          </div>
        ))
      )}
      <IonButton size="small" fill="outline">Add a note to {line.code}</IonButton>
    </>
  );
}

export function LineBody({
  line, plateSize, showPlate = true, dirtyFrom, heightMm, widthMm,
}: {
  line: Line;
  plateSize: ElevationSize;
  /** False while the plate is pinned above — R-18 keeps exactly one plate on
   *  screen, and the pinned one is not this one. */
  showPlate?: boolean;
  dirtyFrom?: string | null;
  heightMm?: number;
  widthMm?: number;
}) {
  return (
    <>
      {showPlate && (
        <Plate line={line} size={plateSize} dirtyFrom={dirtyFrom}
          heightMm={heightMm} widthMm={widthMm} />
      )}
      <Verdicts line={line} />
      <section className="section" aria-label="Facts">
        <h2>This opening</h2>
        <dl className="kv">
          <div><dt>Product</dt><dd>{line.product}</dd></div>
          <div><dt>Size</dt>
            <dd>{line.widthMm > 0
              ? `${mm(line.heightMm)} × ${mm(line.widthMm)} mm (height × width)`
              : <span className="absent">not read from the schedule</span>}</dd></div>
          <div><dt>Quantity</dt><dd>×{line.qty}</dd></div>
          <div><dt>Frame system</dt><dd>{line.frame}</dd></div>
          <div><dt>Line total</dt>
            <dd><Money cents={line.priceCents} absent="no rate" /></dd></div>
        </dl>
      </section>
      {line.lenses.map((l) => <Section key={l.key} line={line} lens={l} />)}
    </>
  );
}
