import type { ReactNode } from "react";
import { SidePanel } from "../chrome/SidePanel";
import type { LineRationaleDto, RationaleUnit } from "../../data/rationale";
import {
  DETAIL, basisLabel, candidateFigures, candidateName, chosenRowMark,
  chosenLine, comparisonVerdict, figuresText, ladderNote, rankedText, unitBandText,
  unitBasisLabel, verdictWord,
} from "./whyCopy";

/**
 * THE RATIONALE, IN FULL — a screen in the navigation tree presented as the
 * approved slide-out (R29 + R19).
 *
 * ── READING ORDER, AND IT IS THE RULE ───────────────────────────────────────
 * The requirement, then what is unusual about THIS line, then the ladder. So
 * the news is never below the routine. On the ordinary machine case blocks 2-4
 * do not exist and the ladder is second, which is the reading this surface is
 * mostly for.
 *
 * ── NO ACTION, ANYWHERE, AND THE ABSENCE IS THE DESIGN ──────────────────────
 * R28/WHY-AC-39: the only interactive element is back. The ladder rows are
 * `<li>` and not buttons — nothing here prices, switches or selects, so nothing
 * looks tappable. `SidePanel`'s footer slot goes unused, because a bar whose
 * only remaining content is one muted line is a bar built for a button that no
 * longer exists.
 */
export function WhyDetail({ dto, open, backLabel, onClose }: {
  /** ANY of the four kinds. WHY-AC-41 — a panel with no detail carries no
   *  control — is superseded (owner, FB-AC-38): every panel has a door, so
   *  every kind has to have something honest behind it. `recommendation` is
   *  unchanged; the other three keep the same headings and NAME what is
   *  missing, which is a different screen from an empty one. */
  dto: LineRationaleDto | null;
  open: boolean;
  /** Where back returns to, named — the line's own code. */
  backLabel: string;
  onClose: () => void;
}) {
  const recommendation = dto && dto.kind === "recommendation" ? dto : null;
  return (
    <SidePanel
      open={open && !!dto}
      onClose={onClose}
      title={DETAIL.title}
      testId="line-why-detail"
      phoneForm="screen"
      dismiss={{ back: backLabel }}
    >
      {recommendation && <Body dto={recommendation} />}
      {dto && dto.kind !== "recommendation" && <Recorded dto={dto} />}
    </SidePanel>
  );
}

type Recommendation = Extract<LineRationaleDto, { kind: "recommendation" }>;

function Body({ dto }: { dto: Recommendation }) {
  const ladder = [dto.recommended, ...dto.alternatives];
  return (
    <div className="wd" data-testid="line-why-body">
      <Block heading={DETAIL.hadToMeet} testId="why-requirement">
        {dto.requirement.absent ? (
          <p className="wd__reason">{DETAIL.noRequirement}</p>
        ) : (
          <dl className="wd__kv">
            <Axis label="Uw" value={axisText(dto.requirement.maxUValue, "≤")} basis={dto.requirement.basis} />
            <Axis label="SHGC" value={shgcText(dto.requirement)} basis={dto.requirement.basis} />
          </dl>
        )}
        {/* R23/WHY-AC-25: the target is the one the run recorded, and a later
            change to the product does not move it. Said out loud only where a
            reader might otherwise wonder. */}
        {dto.selectionChanged && <p className="wd__reason">{DETAIL.targetHeld}</p>}
      </Block>

      {dto.selectionChanged && <Comparison dto={dto} />}
      {dto.composite && <Split dto={dto} composite={dto.composite} />}
      {dto.composite && <Bands units={dto.composite.units} />}

      <Block heading={DETAIL.ladder} testId="why-ladder">
        <ul className="wd__ladder" aria-label={DETAIL.ladder}>
          {ladder.map((c, i) => (
            <li
              key={`${c.productSlug}-${c.rank ?? i}`}
              className={i === 0 ? "wd__row wd__row--chosen" : "wd__row"}
              data-testid="why-ladder-row"
            >
              <span className="wd__row-top">
                <span className="wd__row-name">
                  {candidateName(c)}
                  {i === 0 && (
                    <span className="wd__row-mark"> {chosenRowMark(dto.selectionChanged)}</span>
                  )}
                </span>
                <span className="wd__row-figs">{candidateFigures(c)}</span>
              </span>
              <span className="wd__row-verdict">{verdictWord(c, dto.requirement, dto.tolerance)}</span>
            </li>
          ))}
        </ul>
        <p className="wd__reason">{ladderNote(ladder.length)}</p>
      </Block>

      {/* WHY-AC-38 — the recorded sentence, quiet, at the end. When staff have
          resolved the review flag it lives on, the trace is gone and NOTHING is
          stated: a named residual under R18, not a gap to fill. */}
      {dto.unsuppliedSplitNote && (
        <p className="wd__reason" data-testid="why-split-note">{dto.unsuppliedSplitNote}</p>
      )}

      <p className="wd__reason wd__closing">{DETAIL.closing}</p>
    </div>
  );
}

/**
 * THE DETAIL FOR A LINE WITH NO RECORDED RUN BEHIND IT — `human`, `unrecorded`
 * and `unresolved` (FB-AC-42).
 *
 * SAME HEADINGS, ALWAYS. The DTO for these three carries only the line's own
 * figures (and units, on a human split): no requirement, no candidates. The
 * temptation is to drop the blocks that would be empty, and it is wrong — a
 * screen whose shape changes has to be READ before its content can be, and
 * "this was not recorded" is a fact a reviewer needs, where a missing heading
 * is a fact they have to infer.
 *
 * The `Chosen` sentence is the PANEL'S, verbatim, so the two surfaces cannot
 * describe one line differently. It leads, because on these kinds it is the
 * only thing actually known.
 */
function Recorded({ dto }: { dto: Exclude<LineRationaleDto, { kind: "recommendation" }> }) {
  const chosen = chosenLine(dto);
  const units = dto.kind === "human" ? dto.units : null;
  return (
    <div className="wd" data-testid="line-why-body">
      <p className="wd__reason" data-testid="why-chosen">{chosen.text}</p>

      <Block heading={DETAIL.hadToMeet} testId="why-requirement">
        <p className="wd__reason ops2-absent">{DETAIL.notRecorded}</p>
      </Block>

      {/* THE UNITS BLOCK IS THE RECOMMENDATION'S OWN, not a second copy of it. A
          human-decided split has exactly the units a machine-decided one does,
          and each still carries its own recorded band or the sentence that none
          was recorded — the fact does not change because a person made the
          call. */}
      {units && units.length > 0 ? (
        <Bands units={units} />
      ) : (
        <Block heading={DETAIL.ownFigures} testId="why-figures">
          {/* `unresolved` is not an absent figure — it is a run that established
              there was nothing to select, and the two are told apart by the KIND
              and never by the figures, which are present-and-null in both. So it
              says the panel's own sentence rather than printing `not recorded`
              and claiming the wrong absence. */}
          <p className={dto.kind === "unresolved" ? "wd__reason" : "wd__reason wd__fig"}>
            {dto.kind === "unresolved"
              ? "no selection was made on this line"
              : figuresText(dto.current.figures)}
          </p>
        </Block>
      )}

      <Block heading={DETAIL.ladder} testId="why-ladder">
        <p className="wd__reason ops2-absent">{DETAIL.noAlternatives}</p>
      </Block>

      <p className="wd__reason wd__closing">{DETAIL.closing}</p>
    </div>
  );
}

const axisText = (value: number | null, op: string): string | null =>
  (value == null ? null : `${op} ${value.toFixed(2)}`);

const shgcText = (r: Recommendation["requirement"]): string | null => {
  if (r.minShgc != null && r.maxShgc != null) return `${r.minShgc.toFixed(2)}–${r.maxShgc.toFixed(2)}`;
  if (r.maxShgc != null) return `≤ ${r.maxShgc.toFixed(2)}`;
  if (r.minShgc != null) return `≥ ${r.minShgc.toFixed(2)}`;
  return null;
};

function Axis({ label, value, basis }: { label: string; value: string | null; basis: string | null }) {
  // An axis with no cap is not an axis this opening was held to. Omitted rather
  // than rendered blank, which would claim a cap of nothing.
  if (!value) return null;
  const origin = basisLabel(basis);
  return (
    <div className="wd__kv-row">
      <dt>{label}</dt>
      <dd>
        <span className="wd__fig">{value}</span>
        {origin && <span className="wd__origin">{origin}</span>}
      </dd>
    </div>
  );
}

function Block({ heading, testId, children }: { heading: string; testId: string; children: ReactNode }) {
  return (
    <section className="wd__blk" data-testid={testId} aria-label={heading}>
      <h3 className="wd__blk-h">{heading}</h3>
      {children}
    </section>
  );
}

/** BOTH ARE SHOWN, so the difference is readable — not so one of them is right
 *  (R2/R11). The platform's recommendation is rendered unchanged beside the
 *  line's current configuration, against the SAME caps. */
function Comparison({ dto }: { dto: Recommendation }) {
  const currentVerdict = comparisonVerdict(dto.current.figures, dto.requirement, dto.tolerance);
  return (
    <Block heading={DETAIL.comparison} testId="why-comparison">
      <div className="wd__cmp">
        <div className="wd__card">
          <div className="wd__who">{DETAIL.platformColumn}</div>
          <div className="wd__what">{dto.recommended.productName}</div>
          <div className="wd__fig">{figuresText(dto.recommended.figures)}</div>
          <div className="wd__verd">{verdictWord(dto.recommended, dto.requirement, dto.tolerance)}</div>
        </div>
        <div className="wd__card wd__card--current" data-testid="why-comparison-current">
          <div className="wd__who">{DETAIL.currentColumn}</div>
          <div className="wd__what">{dto.current.productName}</div>
          <div className="wd__fig">{figuresText(dto.current.figures)}</div>
          {/* WHY-AC-27: with no figures to compare, the verdict row is OMITTED
              rather than guessed — and the left card and the requirement are
              still shown, unchanged. */}
          {currentVerdict && <div className="wd__verd wd__verd--warn">{currentVerdict}</div>}
        </div>
      </div>
      <p className="wd__reason">{DETAIL.comparisonNote}</p>
    </Block>
  );
}

function Split({ dto, composite }: { dto: Recommendation; composite: NonNullable<Recommendation["composite"]> }) {
  return (
    <Block heading={DETAIL.split} testId="why-split">
      <div className="wd__cmp">
        <div className="wd__card wd__card--current">
          <div className="wd__who">{DETAIL.splitMadeAs}</div>
          <div className="wd__what">{candidateName(dto.recommended)}</div>
          <div className="wd__fig">{composite.units.map((u) => u.productName).join(" · ")}</div>
          <div className="wd__verd">{rankedText(dto.recommended.rank)}</div>
        </div>
        {/* When no beaten single was recorded the right card is omitted and only
            the make-up shows. Nothing is reconstructed to fill it. */}
        {composite.beatenSingle && (
          <div className="wd__card" data-testid="why-split-beaten">
            <div className="wd__who">{DETAIL.splitBeaten}</div>
            <div className="wd__what">{composite.beatenSingle.productName}</div>
            <div className="wd__fig">{figuresText(composite.beatenSingle.figures)}</div>
            <div className="wd__verd">{rankedText(composite.beatenSingle.rank)}</div>
          </div>
        )}
      </div>
      {composite.beatenSingle && <p className="wd__reason">{DETAIL.splitNote}</p>}
    </Block>
  );
}

/** R16/WHY-AC-34-36 — each lite states its OWN band and its own origin label.
 *  An awning at 0.37–0.41 beside a fixed pane at 0.50–0.56 must read as two
 *  bands, not one. */
function Bands({ units }: { units: RationaleUnit[] }) {
  return (
    <Block heading={DETAIL.bands} testId="why-bands">
      <ul className="wd__lites">
        {units.map((u) => {
          const band = unitBandText(u.band);
          return (
            <li key={u.code} className="wd__lite" data-testid="why-lite">
              <div className="wd__lite-h">
                <span className="wd__lite-code">{u.code}</span>
                <span className="wd__lite-name">{u.productName}</span>
              </div>
              <div className="wd__lite-row">
                {/* WHY-AC-35: a unit with no recorded band says so, and nothing
                    is computed for it — not the parent's, not the sibling's. */}
                <span>Had to meet <span className={band ? "wd__fig" : "ops2-absent"}>
                  {band ?? DETAIL.bandMissing}
                </span></span>
                <span>This one <span className="wd__fig">{figuresText(u.figures)}</span></span>
              </div>
              {unitBasisLabel(u.basis) && <div className="wd__origin">{unitBasisLabel(u.basis)}</div>}
              {u.reviewFlag && (
                <div className="wd__flag" data-testid="why-lite-flag">
                  Flagged on technical review.
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="wd__reason">{DETAIL.bandsNote}</p>
    </Block>
  );
}
