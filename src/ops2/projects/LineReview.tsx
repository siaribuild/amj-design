import type { ReactNode } from "react";
import { Elevation } from "../../components/quote-project/Elevation";
import { Row, RowList } from "../chrome/RowList";
import { Plate } from "./Plate";
import {
  joinedUnitCount, money, needsReview, provenanceWord, sizeText,
  unitLabel, unitsOf, type RecordLine,
} from "./record";

/**
 * ONE OPENING, READ.
 *
 * ── THE RULE THAT KEEPS THIS FROM BECOMING A PILE ───────────────────────────
 * A stack of titled panels is what was rejected once already, so the difference
 * has to be structural rather than a promise:
 *
 *     A PANEL IS A SUMMARY. IT NEVER GROWS TO FIT ITS CONTENT.
 *
 * Every panel below declares a LINE BUDGET and the budget is enforced in code —
 * `Panel` slices to it and states the remainder when it cuts. A panel cannot
 * quietly absorb one more fact, because the fact would not render.
 *
 * ── THE ORDER IS THE EDITOR'S ───────────────────────────────────────────────
 * The drawing, then the size, then the specification, then the price, then the
 * customer's words — the same concerns in the same order as the form that
 * creates a line, so the two are recognisably the same thing.
 *
 * ── WHAT THE SPLIT FORCES ───────────────────────────────────────────────────
 * A composite parent is a schedule line, not a product: there is no single
 * product, glazing or option set to summarise. So THE UNITS REPLACE THE
 * SPECIFICATION, never join it — its units ARE its specification — and a
 * coverage line reports the difference when they do not add up to the opening.
 * It reports; it never vetoes.
 *
 * ── ROUTER-FREE ON PURPOSE ──────────────────────────────────────────────────
 * The record and the line arrive as props, so phase 2's desk canvas renders
 * this same body beside the rail without changing a word of it.
 *
 * ── AND READ-ONLY ───────────────────────────────────────────────────────────
 * No Edit and no re-pricing: each is its own feature with its own decisions,
 * and a control drawn for an action this build cannot perform is the defect
 * this effort has recorded four times.
 *
 * "Why this product" attaches between the specification and the price. It is
 * NOT absent on a composite — that sentence was written before R14 and is void:
 * a composite the machine proposed has a rationale of its own, the split that
 * won and the single unit it beat. An ops-decided split is the case with no
 * machine reasoning to show, and it says so in two lines rather than by
 * disappearing.
 */

// A panel is EITHER a set of labelled facts or a set of bare ones, never a mix.
// The union is what makes that a compile error rather than a comment: a mixed
// array satisfies neither member, so a caller cannot reach the case where a row
// has no term to put in its <dt>.
type LabelledLine = { k: string; v: ReactNode; quiet?: boolean };
type BareLine = { k?: never; v: ReactNode; quiet?: boolean };
type PanelLine = LabelledLine | BareLine;

/** THE BUDGET IS STRUCTURAL. The panel slices to it and says what it cut.
 *
 *  Exported for its MARKUP, which ops2-record.test.mjs renders and asserts. */
export function Panel({ title, lines, budget, more, testId }: {
  title: string;
  lines: LabelledLine[] | BareLine[];
  budget: number;
  /** What the remainder is called when the budget bit. */
  more?: (cut: number) => string;
  testId?: string;
}) {
  const shown = lines.slice(0, budget);
  const cut = lines.length - shown.length;
  // A DESCRIPTION LIST DESCRIBES SOMETHING. The Price panel's rows are a figure
  // and a state, not term/definition pairs, and wrapping them in <dl> emitted
  // <dd> with no <dt> — a definition of nothing, which is what a screen reader
  // was being handed. So the container follows the CONTENT: labelled rows are a
  // description list, bare rows are an ordinary list.
  //
  // `every`, not `some`, on purpose. The type union already makes a mixed panel
  // a compile error, and this is the second lock: if one is ever bypassed, the
  // fallback is a list that renders every value — not a <dl> with an empty <dt>,
  // which is the exact invalid markup this whole change removed.
  const keyed = shown.length > 0 && shown.every((l) => !!l.k);
  const rowClass = (l: PanelLine) =>
    (l.quiet ? "lp-panel__line lp-panel__line--quiet" : "lp-panel__line");
  return (
    <section className="lp-panel" data-testid={testId} aria-label={title}>
      <h2 className="lp-panel__title">{title}</h2>
      {keyed ? (
        <dl className="lp-panel__lines">
          {shown.map((l, i) => (
            <div key={i} className={rowClass(l)}>
              <dt>{l.k}</dt>
              <dd>{l.v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <ul className="lp-panel__lines">
          {shown.map((l, i) => <li key={i} className={rowClass(l)}>{l.v}</li>)}
        </ul>
      )}
      {cut > 0 && more && <p className="lp-panel__more">{more(cut)}</p>}
    </section>
  );
}

/** The units a composite is actually made of. No price and no edit control: the
 *  parent owns the total, and a unit is reached through the parent.
 *
 *  THE WHOLE ROW IS THE VIEWER'S OPENER — the shipped `.rl-open` move from the
 *  record's line list, reused rather than re-invented. A button around the
 *  drawing alone does not work here: its only rest-state affordance would be a
 *  box drawn behind it, which is out of this console's vocabulary, and without
 *  the box it is pixel-identical to the static glyph in the row above it. Hover
 *  is not a fallback — half this console's use is on a phone.
 *
 *  The button must never come to contain another interactive element: a button
 *  inside a button is invalid and the inner one is unreachable. If a unit ever
 *  needs its own control, this decision is reopened rather than worked around. */
function Units({ line, onOpenDrawing }: {
  line: RecordLine;
  onOpenDrawing: (unitIndex: number) => void;
}) {
  const units = unitsOf(line);
  const stacked = line.compositeAxis === "horizontal";
  const openingAlong = Number(stacked ? line.height : line.width);
  const unitsAlong = units.reduce((n, u) => n + Number(stacked ? u.height : u.width), 0);
  const diff = Number.isFinite(openingAlong) && openingAlong > 0 && Number.isFinite(unitsAlong)
    ? unitsAlong - openingAlong
    : 0;
  return (
    <section className="lp-panel lp-units" data-testid="line-units"
      aria-label={`The ${units.length} units of ${line.code}`}>
      <h2 className="lp-panel__title">Made as {units.length} units</h2>
      {/* THE SAME ROW THE QUEUE AND THE RECORD USE, and this list composes NO
          card: it already sits inside `lp-panel`, and a card inside a card is a
          card too many. It passes no `edge` either — a unit carries no status of
          its own; its parent line does. */}
      <RowList className="lp-units__list">
        {units.map((u, i) => (
          <Row
            key={`${u.id}-${i}`}
            pressTestId="line-unit-open"
            onActivate={() => onOpenDrawing(i + 1)}
          >
              {/* THE PURPOSE IS NAMED, AND THE ROW'S OWN WORDS SURVIVE. An
                  `aria-label` here would replace the unit's spec, its size and
                  the customer's note with four words — and that content exists
                  nowhere else in ops2. A hidden first child adds instead. */}
              <span className="ops2-sr-only">Enlarge the drawing of </span>
              <span className="lp-unit__elev">
                <Elevation
                  productSlug={u.productSlug ?? ""}
                  widthMm={u.width}
                  heightMm={u.height}
                  size="xs"
                  square
                  className="lp-unit__svg"
                />
              </span>
              <span className="lp-unit__body">
                <span className="lp-unit__code">{unitLabel(line.code, i)}</span>
                <span className="lp-unit__name">{u.productName}</span>
                <span className="lp-unit__meta">{sizeText(u)}</span>
                {/* THE UNIT'S OWN NOTE. `room_label` on a segment is what the
                    customer wrote about THAT frame — "left", "opens to deck" —
                    and the record view it replaced showed it. Dropping it left
                    no surface in ops2 where a unit-level note can be read. */}
                {u.note && <span className="lp-unit__note">{u.note}</span>}
                {Object.entries(u.options).filter(([, v]) => v).length > 0 && (
                  <span className="lp-unit__spec">
                    {Object.entries(u.options).filter(([, v]) => v).map(([k, v]) => (
                      <span key={k} className="lp-unit__opt">
                        <span className="lp-unit__opt-k">{k}</span> {v}
                      </span>
                    ))}
                  </span>
                )}
              </span>
          </Row>
        ))}
      </RowList>
      {/* IT REPORTS AND NEVER VETOES. A composite whose units overshoot its
          opening is a real thing a reviewer decides about; a refusal here would
          decide it for them. */}
      {diff !== 0 && (
        <p className="lp-coverage" data-testid="line-coverage">
          The units add up to {Math.abs(diff).toLocaleString("en-AU")} mm
          {diff > 0 ? " more" : " less"} than this opening.
        </p>
      )}
    </section>
  );
}


export function LineReview({ line, onOpenDrawing, why, price }: {
  line: RecordLine;
  /** A drawing was activated: the opening itself (`null`) or the 1-based unit.
   *  WHAT that means is the page's, not this body's — see the router-free note
   *  above. The viewer is a node in the tree, so opening it is a navigation. */
  onOpenDrawing: (unitIndex: number | null) => void;
  /** The "Why this product" panel, already wired by the page. `null` on an
   *  order record: D2 puts no panel there at all, and no sentence in its
   *  place — so the absence is a missing element rather than a rendered one. */
  why: ReactNode;
  /** The Price panel, already wired by the page — a door to the calculator,
   *  same router-free seam as `why`. `null` where a record has no price to
   *  set. */
  price: ReactNode;
}) {
  // UNITS, NOT ROWS — see `elevationPartsFor`. A symmetric split is stored as
  // one row carrying two units, and counting rows called it a simple opening.
  const composite = joinedUnitCount(line) >= 2;
  const provenance = provenanceWord(line);
  const options = Object.entries(line.options).filter(([, v]) => v);
  const reasons = Object.values(line.review ?? {});

  return (
    <div className="lp-body" data-testid="line-review">
      <Plate line={line} onOpen={() => onOpenDrawing(null)} />

      {/* The size sits with the drawing it dimensions, carrying one word of
          provenance — a number off a plan and one a customer gave on the phone
          warrant different confidence, and that word is the glanceable half.
          ONE LINE, always. */}
      <p className="lp-size" data-testid="line-size">
        <span className="lp-size__v">{sizeText(line)}</span>
        {provenance && <span className="lp-size__src">{provenance}</span>}
      </p>

      {/* THE REASONS, IN THE SERVER'S OWN WORDS — the half of the badge that
          the list deliberately does not carry. Read before the specification it
          questions. */}
      {needsReview(line) && (
        <section className="lp-panel lp-review" data-testid="line-review-reasons"
          aria-label={`Why ${line.code || "this line"} needs review`}>
          <h2 className="lp-panel__title">Needs review</h2>
          {reasons.length > 0 ? (
            <ul className="lp-review__list">
              {reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          ) : (
            <p className="lp-review__status">{line.status.replace(/_/g, " ")}</p>
          )}
        </section>
      )}

      {composite ? (
        <Units line={line} onOpenDrawing={onOpenDrawing} />
      ) : (
        <Panel
          title="Specification"
          testId="line-spec"
          budget={4}
          more={(cut) => `+${cut} more option${cut === 1 ? "" : "s"}`}
          lines={[
            { k: "Product", v: line.productName },
            ...options.map(([k, v]) => ({ k, v })),
          ]}
        />
      )}

      {why}

      {price}

      {/* THEIR WORDS, READ-ONLY. `quote_line.room_label` is free text the
          customer types, and it is not a thread: there is no line-level comment
          list, and threads are project-level only. */}
      {line.room && (
        <section className="lp-panel lp-note" data-testid="line-note"
          aria-label={`The customer's note on ${line.code || "this line"}`}>
          <h2 className="lp-panel__title">The customer wrote</h2>
          <p className="lp-note__body">{line.room}</p>
        </section>
      )}

      {composite && joinedUnitCount(line) > 0 && (
        <p className="lp-basis">
          The parent owns the total; the units are priced through it.
        </p>
      )}
    </div>
  );
}
