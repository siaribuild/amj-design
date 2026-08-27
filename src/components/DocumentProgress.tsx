// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT PROGRESS — the 6-step reading checklist
//
// Extracted from QuotePage so both customer quote presentations render the same
// progress surface from the same engine (see data/useProjectDocuments.ts).
//
// The work is shown WHERE THE RESULTS WILL LAND. Without it the items area looks
// idle mid-run, which reads as "nothing happened" and invites a pointless second
// upload.
//
// A single line that overwrote itself threw away everything already achieved:
// the customer saw one moving target and no evidence of progress. As a list,
// finished steps stay finished and the run reads as advancing rather than merely
// churning.
// ═══════════════════════════════════════════════════════════════════════════════
import { Check, Loader2 } from "lucide-react";
import type { AiPhase, AiProgressStage, StageLogEntry } from "../data/useProjectDocuments";

// Shorter labels than the single-line fallback: a checklist is scanned, not
// read, and the sentence-length copy belongs to the fallback.
const AI_STEPS: { stage: AiProgressStage | null; label: string }[] = [
  { stage: "queued", label: "Preparing document review" },
  { stage: "reading_documents", label: "Reading the documents" },
  { stage: "extracting_schedule", label: "Extracting the schedule" },
  // A step with NO stage. Reading the drawings happens inside the
  // building_envelope phase — which is why the opening counter first appeared
  // under "Checking thermal requirements", saying something conceptually wrong:
  // finding 19 openings is the SCHEDULE's result, reading their details is its
  // own job, and checking thermal requirements is what happens to each opening
  // afterwards. There is no progress_stage for it and there will not be one
  // (the column's CHECK constraint would need a table rebuild), so the step is
  // driven by the counts instead.
  { stage: null, label: "Extracting opening details" },
  { stage: "building_envelope", label: "Checking thermal requirements" },
  { stage: "matching_and_pricing", label: "Matching products and prices" },
  { stage: "preparing_quote", label: "Preparing your recommendations" },
];
// `waiting_capacity` is deliberately NOT a step: it is not a stage of the work
// but a pause in it, and giving it a row would imply the run had moved on.
const stepIndex = (stage: AiProgressStage | undefined): number =>
  AI_STEPS.findIndex((s) => s.stage === stage);

const fmtDur = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

/** What the customer is told while a run is working.
 *
 *  A COUNT WINS OVER A STAGE, and the reason is worth knowing: there is no
 *  `reading_drawings` stage. `progress_stage` carries a CHECK constraint, and
 *  SQLite cannot extend a CHECK in place — adding a value means rebuilding
 *  ai_job_claim, which is the recipe whose DROP once cascade-deleted 20
 *  order_line and 4 payment rows in production. Two nullable counters carry the
 *  same information and touch nothing, so the label is derived here.
 *
 *  A numerator without a denominator is not a counter: an older run, or a set
 *  with no drawings, has null columns and keeps today's wording exactly.
 *
 *  NOTHING HERE MENTIONS WHAT COULD NOT BE READ. An opening the drawings do not
 *  cover is ordinary — the schedule is authoritative and the drawings add detail
 *  — and it is not a customer's to resolve: they cannot add a split, an
 *  orientation or a head height to an opening that did not parse. A `not_read`
 *  still advances `done`, so the count never stalls on one. */
export const readingMessage = (phase: {
  stage?: AiProgressStage;
  drawingsDone?: number | null;
  drawingsTotal?: number | null;
}): string => {
  const total = phase.drawingsTotal;
  if (typeof total === "number" && total > 0) {
    const done = typeof phase.drawingsDone === "number" ? phase.drawingsDone : 0;
    // Before the first opening resolves, the useful thing to say is how many
    // there are — the moment the count becomes knowable at all.
    return done === 0
      ? "Reading the drawings…"
      : `Reading opening ${done} of ${total}…`;
  }
  return progressMessage(phase.stage);
};

/** The counter as a checklist suffix — ` · opening 7 of 20`.
 *
 *  The single message line only renders when there is NO stage, and a real run
 *  always has one, so the counter has to reach the checklist or the customer
 *  never sees it. Same mechanism the reading step already uses for its document
 *  count, and it hangs off whichever step is in progress: there is no
 *  reading_drawings stage to attach it to, by design. */
const drawingCounts = (phase: AiPhase): { done: number; total: number } | null => {
  if (phase?.kind !== "reading") return null;
  const total = phase.drawingsTotal;
  if (typeof total !== "number" || total <= 0) return null;
  return { done: typeof phase.drawingsDone === "number" ? phase.drawingsDone : 0, total };
};

/** How many openings the schedule yielded — the SCHEDULE step's own result, not
 *  the drawing step's. It is known the moment the count exists, so it stays
 *  visible after that step completes. */
const scheduleDetail = (phase: AiPhase): string | null => {
  const c = drawingCounts(phase);
  return c ? ` · ${c.total} openings found` : null;
};

/** …and the drawing step's own progress through them. */
const drawingDetail = (phase: AiPhase): string | null => {
  const c = drawingCounts(phase);
  return c && c.done > 0 ? ` · opening ${c.done} of ${c.total}` : null;
};

const progressMessage = (stage: AiProgressStage | undefined): string => {
  switch (stage) {
    case "queued": return "Preparing document review…";
    case "reading_documents": return "Reading document text, tables and images…";
    case "extracting_schedule": return "Reading schedules, plans and energy requirements…";
    case "building_envelope": return "Building the thermal context and checking requirements…";
    case "matching_and_pricing": return "Matching suitable products, glazing and prices…";
    case "preparing_quote": return "Preparing the recommendations for your review…";
    case "waiting_capacity": return "Waiting for AI service capacity…";
    default: return "Reading and refining your schedule…";
  }
};

export function DocumentProgress({ uploading, processingDocs, aiPhase, stageLog, nowTick }: {
  uploading: boolean;
  processingDocs: number;
  aiPhase: AiPhase;
  stageLog: StageLogEntry[];
  nowTick: number;
}) {
  // The checklist needs a stage to place the marker. The anonymous
  // deterministic parse reports none, so it keeps the single line.
  const active = aiPhase?.kind === "reading" ? aiPhase.stage : undefined;
  const waiting = active === "waiting_capacity";
  // An unknown stage is treated as the first step rather than as no progress:
  // work IS under way, and showing six pending rows would say the opposite.
  // While openings are still being read, THAT is the step in progress — whatever
  // the stage says. The drawing read runs inside the building_envelope phase, so
  // the stage alone would put the marker on "Checking thermal requirements"
  // while the work is plainly something else.
  const counts = drawingCounts(aiPhase);
  const drawingStep = AI_STEPS.findIndex((s) => s.stage === null);
  const byStage = waiting ? 0 : Math.max(0, stepIndex(active));
  const current = counts && counts.done < counts.total ? drawingStep : byStage;
  const showSteps = aiPhase?.kind === "reading" && !!active;

  // Per-step elapsed, from the observed transition times. A step's end is the
  // next observed step's start; the current step ticks live.
  const stepStart = (i: number) => stageLog.find((s) => s.stage === AI_STEPS[i].stage)?.at;
  const stepDurMs = (i: number): number | null => {
    const start = stepStart(i);
    if (start == null) return null;
    for (let j = i + 1; j < AI_STEPS.length; j++) {
      const nx = stepStart(j);
      if (nx != null) return nx - start;
    }
    return i === current ? Math.max(0, nowTick - start) : null;
  };
  // Stall = no new step for a while. This, not elapsed time, is what actually
  // worries a customer, so it is the only thing that changes the reassurance
  // into a heads-up.
  const lastAt = stageLog.length ? stageLog[stageLog.length - 1].at : 0;
  const sinceLastMs = lastAt ? nowTick - lastAt : 0;
  const concerned = !waiting && showSteps && sinceLastMs >= 45_000;

  return (
    <div role="status" aria-live="polite"
      className="border border-dashed border-sage/45 bg-sage/[0.05] px-4 py-5 t-bd-sm">
      {showSteps ? (
        <>
          <ol className="space-y-2">
            {AI_STEPS.map((step, i) => {
              const done = i < current;
              const inProgress = i === current && !waiting;
              const stalled = i === current && waiting;
              const durMs = stepDurMs(i);
              // Reading step names how many documents it is working through —
              // the honest, available granularity (the PDF text layer is read
              // in one call, so there is no live per-page tick to show).
              // A drawing count outranks the document count: it is the finer
              // granularity, and it is the one the customer asked to see.
              const detail = step.stage === null
                ? drawingDetail(aiPhase) ?? ""
                : step.stage === "extracting_schedule" && scheduleDetail(aiPhase)
                ? scheduleDetail(aiPhase)
                : inProgress && step.stage === "reading_documents" && aiPhase?.kind === "reading" && aiPhase.docs > 0
                ? ` · ${aiPhase.docs} document${aiPhase.docs !== 1 ? "s" : ""}`
                : "";
              return (
                <li key={step.stage} className="flex items-center gap-2.5">
                  <span className="w-4 h-4 flex-shrink-0 grid place-items-center" aria-hidden="true">
                    {done ? (
                      <Check className="w-4 h-4 text-sage" />
                    ) : inProgress || stalled ? (
                      <Loader2 className={`w-4 h-4 text-sage ${stalled ? "" : "animate-spin"}`} />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full border border-line" />
                    )}
                  </span>
                  <span className={
                    done ? "text-body"
                      : inProgress || stalled ? "font-medium text-sage-ink"
                        : "text-quieter"
                  }>
                    {step.label}{detail}
                  </span>
                  {/* The state in words, for anyone not seeing the glyph. */}
                  <span className="sr-only">
                    {done ? " — done" : inProgress ? " — in progress" : stalled ? " — waiting" : " — pending"}
                  </span>
                  {durMs != null && (
                    <span className={`ml-auto tabular-nums ${inProgress ? "text-sage" : "text-quieter"} t-data-sm`}>
                      {fmtDur(durMs)}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className={`mt-3 leading-relaxed ${concerned ? "text-amber-800" : "text-body"}`}>
            {waiting
              ? "Waiting for AI service capacity. Your documents are saved; if this attempt stops, you can retry or send them for human review."
              : concerned
                ? "This step is taking longer than usual — still working. If it can't finish, your documents are saved for human review."
                : "Each step completes as it finishes; a schedule usually takes a minute or two. Your documents are saved either way."}
          </p>
        </>
      ) : (
        <div className="flex items-start gap-3">
          <Loader2 className="w-4 h-4 mt-0.5 flex-shrink-0 animate-spin text-sage" aria-hidden="true" />
          <span>
            <span className="block font-medium text-sage-ink">
              {uploading
                ? `Uploading and checking ${processingDocs} file${processingDocs !== 1 ? "s" : ""}…`
                : aiPhase?.kind === "reading"
                  ? readingMessage(aiPhase)
                  : `Reading your document${processingDocs !== 1 ? "s" : ""}…`}
            </span>
            <span className="block mt-0.5 text-body leading-relaxed">
              This normally finishes in under a minute. If automatic review cannot finish, we will stop and keep your document ready for human review.
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
