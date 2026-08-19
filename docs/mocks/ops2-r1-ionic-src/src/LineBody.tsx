// ═══════════════════════════════════════════════════════════════════════════════
// THE LINE PLANE — four jobs, not one
//
// R1e was "a step towards the right direction UX wise. But not quite right
// conceptually." The reading it was built on — "show me the thing, and tell me
// what is wrong with it" — is right for ARRIVAL and survives. What it missed is
// that arrival is the doorway to four different reviews, and three of them had
// nowhere to happen.
//
// The owner's four scenarios, and where each now lives:
//
//  1. VALIDATE THE OPENING'S DIMENSIONS, against a source that varies — "plan
//     document (file attached) or manual user input (on call)".
//     → the plate's dimension line is the door. DimensionsPage.
//  2. VALIDATE THE RECOMMENDATION — "validate inputs into the model and the
//     output it has produced. What was the Uw target? Dimensions? Reason
//     selected?"
//     → the verdict's control is the door. WhyPage.
//  3. ADJUST THE PRODUCT AND ITS OPTIONS — "ultimately, all those options above
//     -> full product configuration (edit panel) capabilities."
//     → Edit, the primary action, plus a targeted fix control on each problem
//       (R-46: every review reason carries its own fix control).
//  4. ADJUST THE PRICE against the manufacturer's confirmation — "manufacturer's
//     price, plus standard uplift (30%, adjustable on the fly)."
//     → the price row is the door. ManufacturerPricePage.
//
// ── THE STRUCTURAL IDEA: THE DOORS ARE THE FACTS ──────────────────────────────
// Four destinations could easily become a menu, which would be the accordion
// again in a third costume. They are not a menu here. Each door is ATTACHED TO
// THE FACT IT INTERROGATES:
//
//     the dimension line   → is this number right?          (job 1)
//     the verdict          → is this the right product?     (job 2)
//     the price            → is this the right money?       (job 4)
//     Edit                 → change it                      (job 3)
//
// So nothing is added to the screen to hold the new jobs. The same facts R1e
// showed became the way in. A reviewer arrives with a doubt, and the doubt is
// about one of those facts — so they press the fact they doubt.
//
// ── WHAT ARRIVAL STILL OWES ───────────────────────────────────────────────────
// The drawing, and what is wrong, with no scrolling. That test is kept, and it
// is what forced the trimming below: the verdict lost its three-line reasoning
// block (that content is job 2's, and now lives there in full), and product and
// glazing collapsed to one line, because the editor is what changes them and the
// editor is one tap away.
// ═══════════════════════════════════════════════════════════════════════════════
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonNote } from "@ionic/react";
import { chevronForward } from "ionicons/icons";
import { Plate } from "./Plate";
import { DEFAULT_SOURCE, LENS_NAMES, MANUFACTURER, SOURCES, type Line } from "./data";
import { Money, mm } from "./ui";
import type { ElevationSize } from "./elevation";

export type Problem = { text: string; tone: "warning" | "danger"; fix?: string };

/** What is wrong, from real fields, in the order it should be read.
 *
 *  R-46 — every review reason carries its own fix control, because the paths
 *  into the configurator are varied: a size problem, a thermal miss, a family
 *  judgement and an addon request are four different reasons to open the same
 *  editor, and each should land where its fix is. */
export function problemsOf(line: Line): Problem[] {
  const out: Problem[] = [];
  const failed = line.lenses.find((l) => l.failed);
  if (failed) out.push({ text: `${LENS_NAMES[failed.key]} could not be read.`, tone: "danger" });
  line.flags.forEach((f) => {
    const fix = /glaz/i.test(f) ? "Change glazing"
      : /size|height|width|minimum/i.test(f) ? "Change the size"
      : /frame|couple|mixed/i.test(f) ? "Change the frame system"
      : /price|rate/i.test(f) ? undefined
      : undefined;
    out.push({ text: f, tone: "warning", fix });
  });
  return out;
}

const sourceOf = (line: Line) => SOURCES[line.id] ?? DEFAULT_SOURCE;

/** JOB 1's door. The dimension line under the drawing, carrying where the number
 *  came from — because a dimension read off a plan and one a customer said on the
 *  phone warrant different confidence, and that is the whole of scenario 1. */
function DimensionRow({ line, onOpen }: { line: Line; onOpen: () => void }) {
  const src = sourceOf(line);
  const sized = line.widthMm > 0;
  return (
    <button type="button" className="doorrow dimrow" onClick={onOpen}
      aria-label={`Dimensions and their source for ${line.code}`}>
      <span className="dr-main">
        {sized ? `${mm(line.heightMm)} × ${mm(line.widthMm)} mm` : "No size read"}
      </span>
      <span className="dr-sub">
        {src.origin === "manual" ? "entered by hand" : "from the schedule"}
        {src.editedFields.length > 0 && " · edited since"}
      </span>
      <IonIcon icon={chevronForward} aria-hidden="true" />
    </button>
  );
}

/** JOB 2's door, on the verdict it explains. */
function Verdict({ line, onWhy, onEdit }: {
  line: Line; onWhy: () => void; onEdit: (section?: string) => void;
}) {
  const problems = problemsOf(line);
  const tone = problems.some((p) => p.tone === "danger") ? "danger"
    : problems.length ? "warning" : "ok";
  return (
    <section className="verdict" data-tone={tone} aria-label={`Verdict on ${line.code}`}>
      {problems.length === 0 ? (
        <p className="v-ok">Nothing here needs a decision.</p>
      ) : (
        <ul className="v-problems">
          {problems.map((p) => (
            <li key={p.text} data-tone={p.tone}>
              <span className="vp-text">{p.text}</span>
              {p.fix && (
                <button type="button" className="vp-fix" onClick={() => onEdit(p.fix)}>
                  {p.fix}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* One line of evidence, not three. The model's full inputs and its
          ranking are job 2's subject and live on that plane. */}
      <p className="v-evidence">
        {line.requirementMet
          ? `Meets ${line.requirement} · ranked 1st of 4`
          : `Uw 4.1 against a ${line.requirement.replace(/Uw ≤ /, "").split(" ")[0]} cap · still ranked 1st of 4`}
      </p>
      <IonButton fill="outline" size="small" expand="block" onClick={onWhy}>
        Why this product
        <IonIcon slot="end" icon={chevronForward} aria-hidden="true" />
      </IonButton>
    </section>
  );
}

/** JOB 4's door, on the price it questions.
 *
 *  The state matters as much as the figure: a list price and a manufacturer-
 *  confirmed price are different kinds of number, and only one of them is what
 *  goes out. Same grammar as the delivery review row on the record surface. */
function PriceRow({ line, onManufacturer }: { line: Line; onManufacturer: () => void }) {
  const confirmed = MANUFACTURER.quotedCents !== null;
  return (
    <button type="button" className="doorrow pricerow" onClick={onManufacturer}
      aria-label={`Price for ${line.code}. ${confirmed ? "Confirmed with the manufacturer." : "List price, not confirmed with the manufacturer."} Open to change it.`}>
      <span className="dr-main"><Money cents={line.priceCents} absent="no rate" basis /></span>
      <span className="dr-sub">
        {confirmed ? "confirmed with the manufacturer" : "list price"}
      </span>
      <IonIcon icon={chevronForward} aria-hidden="true" />
    </button>
  );
}

export function LineBody({
  line, plateSize, showPlate = true, dirtyFrom, heightMm, widthMm,
  onDimensions, onWhy, onManufacturer, onNotes, onEdit,
}: {
  line: Line;
  plateSize: ElevationSize;
  showPlate?: boolean;
  dirtyFrom?: string | null;
  heightMm?: number;
  widthMm?: number;
  onDimensions: () => void;
  onWhy: () => void;
  onManufacturer: () => void;
  onNotes: () => void;
  onEdit: (section?: string) => void;
}) {
  return (
    <>
      {showPlate && (
        <Plate line={line} size={plateSize} dirtyFrom={dirtyFrom}
          heightMm={heightMm} widthMm={widthMm} captionless />
      )}
      <DimensionRow line={line} onOpen={onDimensions} />
      <Verdict line={line} onWhy={onWhy} onEdit={onEdit} />
      {/* What it is. One line, because the editor is what changes it and the
          editor is the footer. */}
      <p className="linewhat">{line.product} · {line.glazing}</p>
      <PriceRow line={line} onManufacturer={onManufacturer} />
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
