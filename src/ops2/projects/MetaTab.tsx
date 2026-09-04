import { useEffect, useState } from "react";
import { OpenablePanel } from "../chrome/OpenablePanel";
import { SidePanel } from "../chrome/SidePanel";
import type { LineMetaDto, MetaCorrection, MetaFact, MetaReading } from "../../data/lineMeta";

// The Metadata tab — ops2's parse audit surface (design
// docs/runs/ops2-parse-metadata/02-design.md §3.6). See `MetaTab` below for
// the composition; the pieces above it are ordered the way they were driven
// test-first (scripts/tests/ops2-meta.test.mjs) — Image panel, then the two
// summaries, then the expansions.
const IMAGE_LOAD_FAILURE = "The image for this line could not be loaded.";
const NO_READING_FOR_IMAGE = "no reading exists for this opening";
const CROP_UNAVAILABLE_NO_REASON = "the crop is unavailable, no reason recorded";
export const NO_READING = "No reading exists for this opening.";
export const NO_RUN = "No drawing run has been reported for this project.";
export const RUN_OPENING_NOT_COVERED = "This opening was not covered by the run report.";
export const RUN_NO_REPORT = "This run produced no report.";

type ImagePanelView = { img: true } | { img: false; reason: string };

/** Pure so AC-9/10/11 are checkable without a renderer or a fired `onError`
 *  event — `failed` overrides everything else because an image that WAS
 *  showing and then broke is a different fact from one that never had a
 *  crop to show. */
export function imagePanelView(
  hasCrop: boolean, gapCode: string | null, failed: boolean, hasReading: boolean,
): ImagePanelView {
  if (failed) return { img: false, reason: IMAGE_LOAD_FAILURE };
  if (hasCrop) return { img: true };
  if (gapCode) return { img: false, reason: gapCode };
  if (!hasReading) return { img: false, reason: NO_READING_FOR_IMAGE };
  return { img: false, reason: CROP_UNAVAILABLE_NO_REASON };
}

function ImagePanel({
  hasCrop, gapCode, hasReading, cropSrc,
}: { hasCrop: boolean; gapCode: string | null; hasReading: boolean; cropSrc: string }) {
  // LOCAL state, deliberately: AC-11 requires the rest of the tab to keep
  // standing when the crop fails to load, so the failure cannot live any
  // higher than the one panel it happened in.
  const [failed, setFailed] = useState(false);
  // codex P2: a stale failure must not survive onto a later, different crop.
  useEffect(() => setFailed(false), [cropSrc]);
  const view = imagePanelView(hasCrop, gapCode, failed, hasReading);
  return (
    // NOT A DOOR, and `OpenablePanel` is still the right host: openability is
    // the PRESENCE of `open` (decision 8 — the crop has no enlargement), so
    // omitting it is how a plain panel is spelled here. It also means the card,
    // the title and the accessible name come from the same component as the two
    // panels below, instead of a hand-rolled `<section>` drifting from them.
    <OpenablePanel title="Image" testId="meta-image">
      {view.img ? (
        <img
          src={cropSrc}
          alt=""
          className="lp-crop"
          data-testid="meta-image-img"
          onError={() => setFailed(true)}
        />
      ) : (
        <p className="ops2-absent" data-testid="meta-image-reason">{view.reason}</p>
      )}
    </OpenablePanel>
  );
}

function factText(fact: MetaFact): string {
  // AC-13: a fact whose state isn't `value` prints the state word itself,
  // verbatim — `not_stated` and `not_read` stay visibly different.
  return fact.state === "value" ? (fact.value ?? "") : fact.state;
}

function ReadingSummary({ reading }: { reading: MetaReading | null }) {
  if (!reading) {
    return <p className="ops2-absent" data-testid="meta-reading-empty">{NO_READING}</p>;
  }
  return (
    <dl className="lp-panel__lines" data-testid="meta-reading-summary">
      <div className="lp-panel__line"><dt>Heading</dt><dd>{factText(reading.heading)}</dd></div>
      <div className="lp-panel__line"><dt>Elevation</dt><dd>{factText(reading.elevation)}</dd></div>
      <div className="lp-panel__line"><dt>Room</dt><dd>{factText(reading.room)}</dd></div>
      <div className="lp-panel__line"><dt>Confidence</dt><dd>{reading.confidence ?? "not recorded"}</dd></div>
      <div className="lp-panel__line">
        <dt>Flags</dt>
        {/* LISTED, NEVER COUNTED (owner, 2026-09-04). Seven flag values exist
            and the list is bounded at source, so a count only hides which one
            fired — on the one surface that exists to show it. */}
        <dd data-testid="meta-reading-flags">
          {reading.flags.length === 0 ? "none" : (
            <ul className="chips">
              {reading.flags.map((f) => <li key={f} className="chip">{f}</li>)}
            </ul>
          )}
        </dd>
      </div>
    </dl>
  );
}

function RunSummary({ run }: { run: LineMetaDto["run"] }) {
  if (!run) {
    return <p className="ops2-absent" data-testid="meta-run-empty">{NO_RUN}</p>;
  }
  return (
    <dl className="lp-panel__lines" data-testid="meta-run-summary">
      <div className="lp-panel__line"><dt>Started</dt><dd>{run.startedAt}</dd></div>
      <div className="lp-panel__line">
        <dt>This opening</dt>
        <dd data-testid="meta-run-outcome">{run.outcome ?? "not recorded for this opening"}</dd>
      </div>
    </dl>
  );
}

/**
 * PRESENTATION ONLY, no router import — same seam `DrawingViewer`/`WhyDetail`
 * already use. `LinePage` (T5) owns the address; this component is handed a
 * resolved `dto`, the current view, and callbacks, and knows nothing about
 * URLs.
 *
 * THREE PANELS, IMAGE FIRST (AC-9/10/11/12/17), TWO DOORS, ALWAYS OPEN
 * (AC-20 overrides `OpenablePanel`'s no-door-on-empty doctrine — decision 12
 * in the design: a door that appears and disappears per line is the defect
 * being avoided, so both doors are passed unconditionally and the expansion
 * behind an empty one names what is missing rather than not existing).
 */
export function MetaTab({ dto, view, cropSrc, onOpenReading, onOpenRun, onClose }: {
  dto: LineMetaDto;
  view: "meta" | "metaReading" | "metaRun";
  cropSrc: string;
  onOpenReading: () => void;
  onOpenRun: () => void;
  onClose: () => void;
}) {
  return (
    <div className="lp-body" data-testid="meta-tab">
      <ImagePanel
        hasCrop={dto.hasCrop} gapCode={dto.gapCode}
        hasReading={dto.reading !== null} cropSrc={cropSrc}
      />

      <OpenablePanel
        title="Reading"
        testId="meta-reading"
        open={{ label: "Open everything recorded for this reading", onOpen: onOpenReading }}
      >
        <ReadingSummary reading={dto.reading} />
      </OpenablePanel>

      <OpenablePanel
        title="Run"
        testId="meta-run"
        open={{ label: "Open the run report for this document", onOpen: onOpenRun }}
      >
        <RunSummary run={dto.run} />
      </OpenablePanel>

      <SidePanel
        open={view === "metaReading"}
        onClose={onClose}
        title="Reading"
        testId="meta-reading-panel"
        phoneForm="screen"
        dismiss={{ back: "Metadata" }}
      >
        <MetaReadingDetail
          reading={dto.reading} reasoningParts={dto.reasoningParts}
          attempts={dto.attempts} acceptedTurn={dto.acceptedTurn} corrections={dto.corrections}
        />
      </SidePanel>

      <SidePanel
        open={view === "metaRun"}
        onClose={onClose}
        title="Run"
        testId="meta-run-panel"
        phoneForm="screen"
        dismiss={{ back: "Metadata" }}
      >
        <MetaRunDetail run={dto.run} />
      </SidePanel>
    </div>
  );
}

/** Exported so the expansion's full contents (AC-14/15/16) are directly
 *  testable — `SidePanel` wraps its children in an `IonModal`, which is a
 *  Stencil web component: `renderToStaticMarkup` on the wrapper prints only
 *  the `<ion-modal>` host tag, never the light-DOM children, so this
 *  content has to be reachable on its own for a node suite to see it. */
/** The agent's own rails catching it, one row per correction.
 *
 *  TWO SHAPES, AND THE DIFFERENCE IS VISIBLE. A main-path rejection is
 *  `{ turn, reasons }` — no outcome, because the parser writes none, so none is
 *  invented here. An escalation always carries `turn: 1`, being a separate pass
 *  rather than a continuation of the main counter, so it is LABELLED
 *  "Escalation" instead of numbered: printing "Turn 1" under a "Turn 2" would
 *  read as the run going backwards.
 *
 *  Reasons stay raw codes, the same rule the state words follow. */
function CorrectionTrail(
  { attempts, acceptedTurn, corrections }:
  { attempts: number | null; acceptedTurn: number | null; corrections: MetaCorrection[] },
) {
  // ABSENCE IS THE SIGNAL. An opening read first time gets no section at all —
  // not an empty one announcing that nothing went wrong.
  if (corrections.length === 0) return null;
  const heading = acceptedTurn != null && attempts != null
    ? `Corrections · accepted on attempt ${acceptedTurn} of ${attempts}`
    : "Corrections";
  return (
    <section className="wd__blk" data-testid="meta-reading-trail">
      <h3>{heading}</h3>
      {corrections.map((c, i) => (
        <div className="wd__turn" key={i} data-testid="meta-correction">
          <span className="wd__turn-n">
            {c.stage === "escalation" ? "Escalation" : `Turn ${c.turn}`}
          </span>
          <span className="wd__turn-why">
            {c.reasons.map((r) => <code key={r} data-testid="meta-correction-reason">{r}</code>)}
            {c.outcome && <em data-testid="meta-correction-outcome">{c.outcome}</em>}
          </span>
        </div>
      ))}
    </section>
  );
}

export function MetaReadingDetail(
  { reading, reasoningParts, attempts = null, acceptedTurn = null, corrections = [] }: {
    reading: MetaReading | null; reasoningParts: string[];
    attempts?: number | null; acceptedTurn?: number | null; corrections?: MetaCorrection[];
  },
) {
  // NO READING, BUT STILL A REASON. A declined opening has no facts to show,
  // and dropping its reasoning here was how the fix for AC-7 deleted the
  // recorded explanation exactly where a staffer goes looking for it: the
  // Image panel names WHAT stopped the parser, and these lines say why.
  if (!reading) {
    return (
      <div className="wd" data-testid="meta-reading-detail-empty">
        <p className="ops2-absent">{NO_READING}</p>
        {reasoningParts.length > 0 && (
          <section className="wd__blk" data-testid="meta-reading-reasoning">
            <h3>Reasoning</h3>
            {reasoningParts.map((part, i) => (
              <p key={i} data-testid="meta-reasoning-line">{part}</p>
            ))}
          </section>
        )}
        {/* A DECLINED OPENING'S TRAIL IS THE MOST INTERESTING ONE. It has no
            facts to show, so how the agent got there is all there is. */}
        <CorrectionTrail attempts={attempts} acceptedTurn={acceptedTurn} corrections={corrections} />
      </div>
    );
  }
  return (
    <div className="wd" data-testid="meta-reading-detail">
      <p data-testid="meta-detail-fact">Heading: {factText(reading.heading)}</p>
      <p data-testid="meta-detail-fact">Elevation: {factText(reading.elevation)}</p>
      <p data-testid="meta-detail-fact">Room: {factText(reading.room)}</p>

      <section className="wd__blk" data-testid="meta-reading-split">
        <h3>Split</h3>
        <p>
          {reading.split.state === "value"
            ? (reading.split.axis ?? "no axis recorded")
            : reading.split.state}
        </p>
        {reading.split.units.length === 0 ? (
          <p className="ops2-absent">No split units recorded.</p>
        ) : (
          <ul>
            {reading.split.units.map((u, i) => (
              <li key={`${u.role}-${i}`} data-testid="meta-split-unit">
                {u.role} · {u.ratio} · {u.operation ?? "no operation recorded"} · {" "}
                {u.derivedWidthMm != null ? `${u.derivedWidthMm}mm` : "no derived width"}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* AC-16: every flag in full — no cap, no "+N more". */}
      <section className="wd__blk" data-testid="meta-reading-flags">
        <h3>Flags</h3>
        {reading.flags.length === 0 ? (
          <p className="ops2-absent">No flags recorded.</p>
        ) : (
          <ul>{reading.flags.map((f) => <li key={f} data-testid="meta-flag">{f}</li>)}</ul>
        )}
      </section>

      {/* AC-15: `gap_note` was split server-side, once (T1's `readingOf`);
          each part renders on its own line here, never rejoined. */}
      <section className="wd__blk" data-testid="meta-reading-reasoning">
        <h3>Reasoning</h3>
        {reasoningParts.length === 0 ? (
          <p className="ops2-absent">No reasoning recorded.</p>
        ) : (
          reasoningParts.map((part, i) => (
            <p key={i} data-testid="meta-reasoning-line">{part}</p>
          ))
        )}
      </section>

      <section className="wd__blk" data-testid="meta-reading-source">
        <h3>Evidence</h3>
        <p>{reading.source.filename ?? reading.source.fileId ?? "unknown file"}</p>
        <p>Page {reading.source.pageNo ?? "not recorded"}</p>
        <p>Sheet {reading.source.sheetRef ?? "not recorded"}</p>
        <p>Region {reading.source.region ?? "not recorded"}</p>
      </section>

      {/* LAST, per the approved mock: the trail is how the reading above was
          arrived at, so it reads after the reading rather than interrupting it. */}
      <CorrectionTrail attempts={attempts} acceptedTurn={acceptedTurn} corrections={corrections} />
    </div>
  );
}

/** One named group of the Run door.
 *
 *  THE GROUPS ARE THE FEATURE. Twenty-two figures in one list is the wall the
 *  owner rejected — "information behind doors must be readable, not just a text
 *  area field". They are ordered the way the run happened, so the door reads as
 *  a sequence rather than an inventory: what the document was, what it looked
 *  at, what it read, where it placed the results, then what it cost. */
function RunGroup({ title, testId, children }: {
  title: string; testId?: string; children: React.ReactNode;
}) {
  return (
    <section className="wd__blk" data-testid={testId}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

const Row = ({ k, v, testId }: { k: string; v: React.ReactNode; testId?: string }) => (
  <div className="wd__kv-row"><dt>{k}</dt><dd data-testid={testId}>{v}</dd></div>
);

/** A figure the run never measured is NOT zero. A report written before the
 *  agentic parser carries no token counts and no targeted-review count, and
 *  printing 0 for those would be a measurement this run never made. */
const figure = (n: number | null | undefined) => (n == null ? "not recorded" : String(n));

export function MetaRunDetail({ run }: { run: LineMetaDto["run"] }) {
  if (!run) {
    return <p className="ops2-absent" data-testid="meta-run-detail-empty">{NO_RUN}</p>;
  }
  if (!run.document) {
    // TWO DIFFERENT ABSENCES. A run that produced no report at all (it failed,
    // or is still going) is not a report that left this opening out, and saying
    // the second when the first is true sends a staffer looking for a document
    // that does not exist.
    return (
      <p className="ops2-absent" data-testid="meta-run-detail-empty">
        {run.reported ? RUN_OPENING_NOT_COVERED : RUN_NO_REPORT}
      </p>
    );
  }
  const doc = run.document;
  const { steps } = doc;
  const t = doc.telemetry;
  return (
    <div className="wd" data-testid="meta-run-detail">
      <RunGroup title="This run">
        <dl className="wd__kv">
          <Row k="Started" v={run.startedAt} />
          <Row k="This opening" testId="meta-run-detail-outcome"
               v={run.outcome ?? "not recorded for this opening"} />
          <Row k="Document" v={doc.fileId} />
        </dl>
      </RunGroup>

      <RunGroup title="The document" testId="meta-run-inventory">
        <dl className="wd__kv">
          <Row k="Pages" v={steps.inventory.pages} />
          <Row k="Fonts" v={steps.inventory.fonts} />
          <Row k="Images" v={steps.inventory.images} />
          <Row k="Attachments" v={steps.inventory.attachments} />
          <Row k="Strategy" v={steps.strategy} />
        </dl>
      </RunGroup>

      <RunGroup title="What it looked at">
        <dl className="wd__kv">
          <Row k="Pages read" v={steps.text.pagesRead} />
          {/* `of` is the DOCUMENT's page count, not the number selected — codex
              P2. Labelled "Pages selected" it printed 20 where 4 were chosen,
              contradicting the list below it. Both halves, so neither can be
              mistaken for the other. */}
          <Row k="Pages selected" testId="meta-run-pages-selected"
               v={`${steps.selectPages.selected.length} of ${steps.selectPages.of}`} />
          <Row k="Crops rendered"
               v={`${steps.renderCrop.pagesRendered} pages, ${steps.renderCrop.cropsMade} crops`} />
        </dl>
        {/* AC-16: every entry in full — no cap, no "+N more". */}
        <div data-testid="meta-run-select-pages">
          {steps.selectPages.selected.length === 0 ? (
            <p className="ops2-absent">No pages selected.</p>
          ) : (
            <ul>
              {steps.selectPages.selected.map((sp) => (
                <li key={sp.pageNo} data-testid="meta-run-select-page">
                  Page {sp.pageNo} · {sp.tier} · {sp.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div data-testid="meta-run-elevation-regions">
          {steps.elevationRegions.length === 0 ? (
            <p className="ops2-absent">No elevation regions.</p>
          ) : (
            <ul>
              {steps.elevationRegions.map((r) => (
                <li key={r.pageNo} data-testid="meta-run-elevation-region">
                  Page {r.pageNo} · {r.labels.join(", ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      </RunGroup>

      <RunGroup title="What it read" testId="meta-run-steps">
        <dl className="wd__kv">
          <Row k="Attempted" v={steps.read.attempted} />
          <Row k="Returned" v={steps.read.returned} />
          <Row k="Declined" v={steps.read.declined} />
          <Row k="Retried with threshold" v={steps.read.retriedWithThreshold} />
          <Row k="Targeted reviews" v={figure(steps.read.targetedReviews)} />
        </dl>
      </RunGroup>

      <RunGroup title="Where it placed them">
        <dl className="wd__kv">
          <Row k="From text" v={steps.placements.fromText} />
          <Row k="From model fallback" v={steps.placements.fromModelFallback} />
          <Row k="Unplaced" v={steps.placements.unplaced} />
          <Row k="North assumed" v={steps.northAssumed ? "yes" : "no"} />
        </dl>
      </RunGroup>

      <RunGroup title="Cost and health">
        <dl className="wd__kv">
          <Row k="Wall time" v={doc.wallMs != null ? `${doc.wallMs}ms` : "not recorded"} />
          <Row k="Model calls" v={figure(doc.modelCalls)} />
          <Row k="Tokens in / out" v={`${figure(t.inputTokens)} / ${figure(t.outputTokens)}`} />
          <Row k="Turns cached" v={figure(t.cachedTurns)} />
          <Row k="Turns repaired" v={figure(t.repairedTurns)} />
          <Row k="Failed phase" testId="meta-run-failed-phase" v={doc.failedPhase ?? "none"} />
          {/* A PROVIDER FAILURE IS NOT AN UNREADABLE DRAWING. One needs whoever
              owns the integration, the other whoever drew the plans, and a tab
              that renders them alike sends the wrong person looking. */}
          <Row k="Provider" testId="meta-run-provider"
               v={doc.providerFailure
                 ? [doc.providerFailure.failureKind ?? "failed", ...doc.providerFailure.warnings].join(" · ")
                 : "no failure"} />
        </dl>
      </RunGroup>
    </div>
  );
}

