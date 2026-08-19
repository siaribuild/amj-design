// ═══════════════════════════════════════════════════════════════════════════════
// THE LINE PLANE — reimagined, not repaired
//
// "When I said 'remove accordions' as they are a cheat code for putting a lot of
//  information into a single screen without thinking, which I think is correct
//  still, you simply did exactly that."
//
// He is right, and that sentence is the whole brief. The accordion was the
// symptom; the disease was putting everything on one screen without deciding what
// belonged there. Opening the lids did not treat it — it made the pile visible,
// and then a verdict index was added on top: a contents page for a document
// nobody chose to write.
//
// So this is not a re-layout of the same content. It starts from the job.
//
// ── WHAT THE REVIEWER IS DOING ─────────────────────────────────────────────────
// A founder, on a phone, with the customer on the call. They tapped this line
// from a list that ALREADY told them the code, the product, the size, the price
// and whether it needs review. They did not come to re-read those. They came for
// the two things a row cannot carry:
//
//     "Show me the thing, and tell me what is wrong with it."
//
// That is the first two seconds. Everything on arrival serves it.
//
// ── PRIMARY INFORMATION ────────────────────────────────────────────────────────
//  1. THE DRAWING. The highest-praised element in the product and the fastest
//     answer to "is this the right thing" — shape, arrangement, which way it
//     opens, real dimensions. It is also what the reviewer turns the phone around
//     to show, and what lets them say "the wide one with the two openers" to a
//     customer who does not read schedules. Primary, unarguably (R-17/R-154).
//  2. THE VERDICT, IN WORDS. Not five verdicts — the problems, or the absence of
//     them. One line each; there are rarely more than two.
//
// ── PRIMARY ACTION ─────────────────────────────────────────────────────────────
// Edit. The grill settled it: adjudication is performed conversationally and
// "its normal outcome is a change, not a tick". So the footer is Edit, not
// Confirm (R-153, unchanged).
//
// ── WHAT EARNS A SECOND STEP, AND WHY ──────────────────────────────────────────
// The test is not "is this more stuff" but "is this a different job".
//
//  • THE ALTERNATIVES — a different job: pricing a compromise while the customer
//    is talking. "home owners might want to save money and choose the next-worse
//    solution that is cheaper despite marginally failing to meet requirements."
//    A real path, taken on a call, driven by a different motive than the one that
//    opened the line. It is also the owner's own ruling: "winner's reasoning
//    visible; losers one tap away, ranked, with their reason. But it stays
//    collapsed by default so the common case isn't buried." R1c inverted that
//    ruling by rendering the losers inline, as IDs, against the action panel.
//    → Its own plane.
//  • THE NOTES — a different job: recording what was said, which the grill calls
//    load-bearing ("Taking notes — that requires another device or notebook").
//    Short, frequent, and it needs a composer rather than a reading surface.
//    → Its own plane, with the inline composer the record's Notes already uses.
//
// ── WHAT IS NOT ON THIS SCREEN AT ALL ──────────────────────────────────────────
//  • The verdict index. A contents page for a screen you can see all of.
//  • The five section headings. They were the accordion with its lids off.
//  • The facts grid. The drawing dimensions the opening, the header names it, the
//    row you tapped priced it. Restating them was filler.
//  • "Source: no page reference recorded." Absent provenance is worth stating
//    where provenance is the subject — the alternatives plane — not on the screen
//    whose job is "show me the thing".
//  • The candidates table. Moved, and it stops being a list of IDs.
//
// ── RULES THAT DIE WITH THE SECTIONS, AND WHY THAT IS SOUND ────────────────────
//  R-43  "identical chip set and order on every line" — no chips, no sections.
//  R-47  the arrival walk chose which section to open. Nothing opens now; the
//        verdict block is always the first thing under the drawing, so the walk
//        is not enacted — it is the layout.
//  R-48  session memory of what was opened. Already gone in R1b.
//  R-44  survives, and is stronger: a panel that could not be read becomes a
//        PROBLEM in the verdict block, not a heading that has to be found.
//  R-45  survives: verdicts come from real fields, and the note count is notes.
//  R-53.x / R-56 move to the alternatives plane, where the candidate set lives.
// ═══════════════════════════════════════════════════════════════════════════════
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonNote } from "@ionic/react";
import { chevronForward } from "ionicons/icons";
import { Plate } from "./Plate";
import { LENS_NAMES, type Line } from "./data";
import { Money } from "./ui";
import type { ElevationSize } from "./elevation";

export type Problem = { text: string; tone: "warning" | "danger" };

/** What is wrong with this line, in the order it should be read.
 *
 *  From real fields, not synthesised: a failed read first, because nothing else
 *  on the line can be trusted while it stands (R-44), then the estimator's own
 *  flags verbatim. The missing-rate case is deliberately NOT repeated here — it
 *  shows where the price would be, which is where someone looking for a price is
 *  already looking. */
export function problemsOf(line: Line): Problem[] {
  const out: Problem[] = [];
  const failed = line.lenses.find((l) => l.failed);
  if (failed) out.push({ text: `${LENS_NAMES[failed.key]} could not be read.`, tone: "danger" });
  line.flags.forEach((f) => out.push({ text: f, tone: "warning" }));
  return out;
}

/** The verdict, and the winner's reasoning beneath it.
 *
 *  The owner's ruling in one block: the reasoning for the CHOSEN product is
 *  visible; the products it beat are one tap away. C4 governs the tone — a
 *  problem is stated, never gated, and nothing here asks to be acknowledged. */
function Verdict({ line, onAlternatives }: { line: Line; onAlternatives: () => void }) {
  const problems = problemsOf(line);
  const tone = problems.some((p) => p.tone === "danger") ? "danger"
    : problems.length ? "warning" : "ok";
  return (
    <section className="verdict" data-tone={tone} aria-label={`Verdict on ${line.code}`}>
      {problems.length === 0 ? (
        <p className="v-ok">Nothing here needs a decision.</p>
      ) : (
        <ul className="v-problems">
          {problems.map((p) => <li key={p.text} data-tone={p.tone}>{p.text}</li>)}
        </ul>
      )}

      {/* The winner's reasoning — visible, per the ruling. Three lines, because
          three facts are the whole argument: what it was chosen from, what it
          had to meet, and what it actually achieves. */}
      <dl className="v-why">
        <div><dt>Chosen from</dt><dd>{line.basis}</dd></div>
        <div><dt>Requirement</dt><dd>{line.requirement}</dd></div>
        <div><dt>This product</dt>
          <dd className={line.requirementMet ? undefined : "miss"}>
            {line.requirementMet ? "Uw 3.7 · SHGC 0.41" : "Uw 4.1 · SHGC 0.52"}
          </dd></div>
      </dl>

      <IonButton fill="outline" size="small" expand="block" onClick={onAlternatives}>
        Show what it was chosen over
        <IonIcon slot="end" icon={chevronForward} aria-hidden="true" />
      </IonButton>
    </section>
  );
}

/** What it is, and what it costs. Three facts, not a grid of six: the product and
 *  the glazing are what get changed on a call, and the price is what the customer
 *  asks about. Size is absent on purpose — the drawing above dimensions it, and
 *  repeating a number the drawing already draws is how the pile started. */
function Spec({ line }: { line: Line }) {
  return (
    <section className="linespec" aria-label="Specification">
      <div className="ls-row">
        <span className="ls-k">Product</span>
        <span className="ls-v">{line.product}</span>
      </div>
      <div className="ls-row">
        <span className="ls-k">Glazing</span>
        <span className="ls-v">{line.glazing}</span>
      </div>
      <div className="ls-row ls-money">
        <span className="ls-k">Line total</span>
        <span className="ls-v"><Money cents={line.priceCents} absent="no rate" basis /></span>
      </div>
      {line.priceCents === null && (
        /* R-66 — a price that refuses is correct behaviour, and the console says
           WHICH number is missing, in full. It sits where the price would be. */
        <div className="note-warning" role="note">
          <b className="lede">Missing rates:</b>
          <ul>
            <li>{line.frame} · {line.glazing} · rate band 1,800–2,400 mm high</li>
            <li>Zone 4 — Outer metro delivery rate</li>
          </ul>
        </div>
      )}
    </section>
  );
}

export function LineBody({
  line, plateSize, showPlate = true, dirtyFrom, heightMm, widthMm,
  onAlternatives, onNotes,
}: {
  line: Line;
  plateSize: ElevationSize;
  showPlate?: boolean;
  dirtyFrom?: string | null;
  heightMm?: number;
  widthMm?: number;
  onAlternatives: () => void;
  onNotes: () => void;
}) {
  return (
    <>
      {showPlate && (
        <Plate line={line} size={plateSize} dirtyFrom={dirtyFrom}
          heightMm={heightMm} widthMm={widthMm} />
      )}
      <Verdict line={line} onAlternatives={onAlternatives} />
      <Spec line={line} />
      {/* The second step for the other job. A push row — the same grammar the
          approved list view uses for the project's blocks. */}
      <IonList lines="full">
        <IonItem button detail={false} onClick={onNotes}>
          <IonLabel>
            <strong>Notes</strong>
            <p className={line.notes.length ? undefined : "absent"}>
              {line.notes.length === 0
                ? "Nothing recorded on this line"
                : `${line.notes.length} on this line · latest ${line.notes[0].who}`}
            </p>
          </IonLabel>
          <IonIcon slot="end" icon={chevronForward} color="medium" aria-hidden="true" />
        </IonItem>
      </IonList>
      {line.parts && (
        <IonNote className="fact basis linefoot">
          Made as {line.parts.reduce((n, p) => n + (p.qty ?? 1), 0)} units — tap the
          drawing to see how they are joined.
        </IonNote>
      )}
    </>
  );
}
