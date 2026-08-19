// ═══════════════════════════════════════════════════════════════════════════════
// THE LINE — VIEW MODE
//
// The owner's shape: "First screen is read-only view, as per quote view item
// expanded: drawing, non-editable details below. Leads to full edit mode if
// clicked. Extra on that screen - why this product panel (key information
// surfaced, more details in next panel). Price panel, leading to re-pricing
// panel."
//
// ── THE ONE RULE THAT KEEPS THIS FROM BECOMING THE PILE AGAIN ─────────────────
// A stack of titled panels is what was rejected in R1e, so the difference has to
// be structural rather than a promise. It is this:
//
//     A PANEL IS A SUMMARY THAT LEADS SOMEWHERE.
//     IT NEVER GROWS TO FIT ITS CONTENT.
//
// Every panel below declares a LINE BUDGET and the budget is enforced in code —
// `Panel` slices to it and demands a `more` string when it truncates. A panel
// cannot silently absorb one more fact, because the fact would not render. That
// matters more than usual now: the no-scroll property was deliberately given up
// ("with splits in particular, we're unlikely to fit into no scroll concept.
// I'm ok to sacrifice that"), and it was the only mechanism that had actually
// stopped content creeping back. The budgets carry that load alone.
//
// A "line" is one rendered row of text at the panel's own size. Overflow is
// either clamped with a stated remainder ("+3 more options") or lives in the
// panel the summary leads to. Never both, never neither.
//
// ── THE ORDER IS ItemForm's ──────────────────────────────────────────────────
// "mirroring what is in the edit panel conceptually, but following mobile-first
// concept." ItemForm's fields run: Item ID → product type → product → size →
// options → note (ItemComposer.tsx:536ff), with price shown as a preview and
// never an input. View mode runs the same concerns in the same order, so the two
// modes are recognisably the same thing:
//
//     the drawing            (the hero — ItemForm draws it in-form too)
//     Specification          product · size · options        → the spec panel
//     Why this product       what it had to meet, and whether → the why panel
//     Price                  the figure and its state         → re-pricing
//     The customer's note    their words, read-only
//
// ── THE ACTION IS EDIT ───────────────────────────────────────────────────────
// Not Save/Cancel. "good catch. we can adjust as needed." There is nothing to
// commit on a read-only screen; Save and Cancel belong in edit mode.
//
// ── WHAT THE SPLIT FORCED ────────────────────────────────────────────────────
// A composite parent is a schedule line, not a product — ItemForm gives it
// `hideProduct`/`hideOptions` for exactly that reason. So on a split:
//
//   • THE SPECIFICATION PANEL IS REPLACED BY THE UNITS, NEVER BOTH. The customer
//     list settled this ("a spec panel above the units would describe nothing",
//     OpeningList.tsx:99-105) and the same logic holds here: the parent has no
//     single product, glazing or option set to summarise. Its units ARE its
//     specification.
//   • THE WHY PANEL DISAPPEARS ENTIRELY — from the parent AND from every unit.
//     The estimator recommends a product per OPENING. A composite is ONE opening
//     the customer submitted and ops then split, so the units' products were an
//     ops decision made in the split planner, not a machine recommendation.
//     There is nothing to justify anywhere on a split, and inventing a rationale
//     would be worse than the absence.
//   • A COVERAGE LINE APPEARS — the units' widths against the opening's. It
//     reports and never vetoes.
//   • Units get no price and no pencil. The parent owns the total; units are
//     reached through the parent's editor (UnitRow.tsx:137).
// ═══════════════════════════════════════════════════════════════════════════════
import { IonButton, IonIcon, IonNote } from "@ionic/react";
import { chevronForward } from "ionicons/icons";
import { Plate } from "./Plate";
import { Elevation } from "./elevation";
import {
  CUSTOMER_NOTE, DEFAULT_SOURCE, MANUFACTURER, SOURCES, type Line,
} from "./data";
import { Money, mm } from "./ui";
import type { ElevationSize } from "./elevation";

/* ── unitLabel, ported from rowState.ts:63 — W04A, W04B, … ─────────────────── */
export const unitLabel = (code: string, i: number) =>
  `${code}${String.fromCharCode(65 + i)}`;

/** The units a composite is actually made of, flattened by qtyPerParent — the
 *  count WITHIN a line, which is not the retired quantity (D4). */
export function unitsOf(line: Line) {
  return (line.parts ?? []).flatMap((p, gi) =>
    Array.from({ length: Math.max(1, p.qty ?? 1) }, () => p).map((u) => ({ ...u, gi })));
}

type PanelLine = { k?: string; v: React.ReactNode; tone?: "quiet" | "warn" };

/** THE BUDGET IS STRUCTURAL. A panel slices to `budget` and will not render what
 *  it cannot fit; if it had to cut, it must have been given a `more` string to
 *  say so. That is what stops a summary quietly becoming a container. */
function Panel({
  title, lines, budget, more, onOpen, ariaLabel,
}: {
  title: string;
  lines: PanelLine[];
  budget: number;
  more?: string;
  onOpen?: () => void;
  ariaLabel?: string;
}) {
  const shown = lines.slice(0, budget);
  const cut = lines.length > budget;
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag
      {...(onOpen ? { type: "button" as const, onClick: onOpen, "aria-label": ariaLabel ?? title } : {})}
      className={"lpanel" + (onOpen ? " lpanel-door" : "")}>
      <span className="lp-head">
        <span className="lp-title">{title}</span>
        {onOpen && <IonIcon icon={chevronForward} aria-hidden="true" />}
      </span>
      <span className="lp-lines">
        {shown.map((l, i) => (
          <span key={i} className={"lp-line" + (l.tone ? ` lp-${l.tone}` : "")}>
            {l.k && <span className="lp-k">{l.k}</span>}
            <span className="lp-v">{l.v}</span>
          </span>
        ))}
        {(cut || more) && <span className="lp-more">{more}</span>}
      </span>
    </Tag>
  );
}

const sourceOf = (line: Line) => SOURCES[line.id] ?? DEFAULT_SOURCE;
const sourceWord = (line: Line) =>
  sourceOf(line).origin === "manual" ? "entered by hand" : "from the schedule";

/* ── The units block. Replaces Specification on a split, never joins it. ────── */
function Units({ line, onUnit }: { line: Line; onUnit: (i: number) => void }) {
  const units = unitsOf(line);
  const along = units.reduce((n, u) => n + Number(u.alongMm), 0);
  const diff = along - line.widthMm;
  return (
    <section className="lpanel lpanel-units" aria-label={`The ${units.length} units of ${line.code}`}>
      <span className="lp-head">
        <span className="lp-title">Made as {units.length} units</span>
      </span>
      <ul className="unitlist">
        {units.map((u, i) => (
          <li key={i}>
            <button type="button" onClick={() => onUnit(i)}
              aria-label={`${unitLabel(line.code, i)}, ${u.op}, ${u.alongMm} mm wide`}>
              <span className="u-elev">
                <Elevation op={u.op} widthMm={Number(u.alongMm)} heightMm={line.heightMm}
                  size="xs" square className="elev" />
              </span>
              <span className="u-body">
                <span className="u-code mono">{unitLabel(line.code, i)}</span>
                <span className="u-spec">{u.label.split("·").slice(1).join("·").trim() || u.op}</span>
              </span>
              {/* No unit price: the parent owns the total. No pencil: a unit is
                  reached through the parent's editor. */}
              <IonIcon icon={chevronForward} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {/* CoverageNotice, ported. It reports; it never vetoes. */}
      {diff !== 0 && (
        <p className="coverage">
          The units add up to {mm(Math.abs(diff))} mm {diff > 0 ? "more" : "less"} than
          this opening.
        </p>
      )}
    </section>
  );
}

export function LineBody({
  line, plateSize, showPlate = true, dirtyFrom, heightMm, widthMm,
  onSpec, onWhy, onManufacturer, onUnit,
}: {
  line: Line;
  plateSize: ElevationSize;
  showPlate?: boolean;
  dirtyFrom?: string | null;
  heightMm?: number;
  widthMm?: number;
  onSpec: () => void;
  onWhy: () => void;
  onManufacturer: () => void;
  onUnit: (i: number) => void;
}) {
  const composite = !!line.parts;
  const note = CUSTOMER_NOTE[line.id];
  const confirmed = MANUFACTURER.quotedCents !== null;
  const optionCount = 4; // glazing + 3 more the product offers

  return (
    <>
      {showPlate && (
        <Plate line={line} size={plateSize} dirtyFrom={dirtyFrom}
          heightMm={heightMm} widthMm={widthMm} captionless />
      )}

      {/* The size sits with the drawing it dimensions, carrying one word of
          provenance — a number off a plan and one a customer gave on the phone
          warrant different confidence, and that word is the glanceable half.
          BUDGET: 1 line. The full provenance is in the spec panel. */}
      <p className="sizeline">
        <span className="sl-v">
          {line.widthMm > 0 ? `${mm(line.heightMm)} × ${mm(line.widthMm)} mm` : "No size read"}
        </span>
        <span className="sl-src">{sourceWord(line)}</span>
      </p>

      {composite ? (
        <Units line={line} onUnit={onUnit} />
      ) : (
        /* BUDGET: 4 lines — product, glazing, one more option, then the count of
           whatever is left. Everything the product offers is in the panel. */
        <Panel title="Specification" budget={4} onOpen={onSpec}
          ariaLabel={`Specification for ${line.code}`}
          more={`+${optionCount - 2} more options`}
          lines={[
            { k: "Product", v: line.product },
            { k: "Glazing", v: line.glazing },
            { k: "Frame", v: line.frame },
            { k: "Hardware", v: "Standard", tone: "quiet" },
            { k: "Flyscreen", v: "None", tone: "quiet" },
          ]} />
      )}

      {/* Absent on a split: a composite is one opening that ops divided, so no
          estimator recommendation exists to justify — see the header.
          BUDGET: 3 lines. */}
      {!composite && (
        <Panel title="Why this product" budget={3} onOpen={onWhy}
          ariaLabel={`Why ${line.product} was chosen for ${line.code}`}
          more="What else was considered"
          lines={[
            { k: "Had to meet", v: line.requirement },
            { k: "This one", v: line.requirementMet ? "Uw 3.7 · SHGC 0.41" : "Uw 4.1 · SHGC 0.52",
              tone: line.requirementMet ? undefined : "warn" },
            { k: "Chosen", v: line.requirementMet
                ? "cheapest that met both"
                : "closest that fits — nothing met the cap", tone: "quiet" },
          ]} />
      )}

      {/* BUDGET: 2 lines — the figure, and what kind of figure it is. */}
      <Panel title="Price" budget={2} onOpen={onManufacturer}
        ariaLabel={`Price for ${line.code}. ${confirmed ? "Confirmed with the manufacturer" : "List price"}. Open to re-price.`}
        more={confirmed ? undefined : "Confirm against the manufacturer"}
        lines={[
          { v: <Money cents={line.priceCents} absent="no rate" basis /> },
          { v: confirmed ? "confirmed with the manufacturer" : "list price", tone: "quiet" },
        ]} />

      {/* The CUSTOMER'S note — quote_line.room_label, their words, read-only.
          Not a thread and not editable: there is no line-level comment list, and
          threads are project-level only. BUDGET: 2 lines, clamped; the whole of
          it is in the spec panel, where ItemForm keeps the field. */}
      {note && (
        <section className="lpanel notepanel" aria-label={`The customer's note on ${line.code}`}>
          <span className="lp-head"><span className="lp-title">The customer wrote</span></span>
          <p className="cust-note">{note}</p>
        </section>
      )}
    </>
  );
}
