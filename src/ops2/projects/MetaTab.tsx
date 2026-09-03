import { useEffect, useState } from "react";
import { OpenablePanel } from "../chrome/OpenablePanel";
import { SidePanel } from "../chrome/SidePanel";
import type { LineMetaDto, MetaFact, MetaReading } from "../../data/lineMeta";

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
        <dd data-testid="meta-reading-flag-count">
          {reading.flags.length > 0 ? `flags: ${reading.flags.length} present` : "flags: none"}
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
        <MetaReadingDetail reading={dto.reading} reasoningParts={dto.reasoningParts} />
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
export function MetaReadingDetail(
  { reading, reasoningParts }: { reading: MetaReading | null; reasoningParts: string[] },
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
        <h3>Source</h3>
        <p>{reading.source.filename ?? reading.source.fileId ?? "unknown file"}</p>
        <p>Page {reading.source.pageNo ?? "not recorded"}</p>
        <p>Sheet {reading.source.sheetRef ?? "not recorded"}</p>
        <p>Region {reading.source.region ?? "not recorded"}</p>
      </section>
    </div>
  );
}

export function MetaRunDetail({ run }: { run: LineMetaDto["run"] }) {
  if (!run) {
    return <p className="ops2-absent" data-testid="meta-run-detail-empty">{NO_RUN}</p>;
  }
  if (!run.document) {
    return <p className="ops2-absent" data-testid="meta-run-detail-empty">{RUN_OPENING_NOT_COVERED}</p>;
  }
  const { steps } = run.document;
  return (
    <div className="wd" data-testid="meta-run-detail">
      <p>Started {run.startedAt}</p>
      <p data-testid="meta-run-detail-outcome">This opening: {run.outcome ?? "not recorded for this opening"}</p>
      <p>Document {run.document.fileId}</p>

      <dl data-testid="meta-run-inventory">
        <div><dt>Pages</dt><dd>{steps.inventory.pages}</dd></div>
        <div><dt>Fonts</dt><dd>{steps.inventory.fonts}</dd></div>
        <div><dt>Images</dt><dd>{steps.inventory.images}</dd></div>
        <div><dt>Attachments</dt><dd>{steps.inventory.attachments}</dd></div>
        <div><dt>Strategy</dt><dd>{steps.strategy}</dd></div>
        <div><dt>Pages read</dt><dd>{steps.text.pagesRead}</dd></div>
        {/* `of` is the DOCUMENT's page count, not the number selected — codex
            P2. Labelling it "Pages selected" printed 20 where 4 pages were
            chosen, and contradicted the list of selected pages directly below
            it. Both halves, so the ratio is readable and neither can be
            mistaken for the other. */}
        <div>
          <dt>Pages selected</dt>
          <dd data-testid="meta-run-pages-selected">
            {steps.selectPages.selected.length} of {steps.selectPages.of}
          </dd>
        </div>
      </dl>

      {/* AC-16: every entry in full — no cap, no "+N more". */}
      <section data-testid="meta-run-select-pages">
        <h3>Selected pages</h3>
        {steps.selectPages.selected.length === 0 ? (
          <p className="ops2-absent">None.</p>
        ) : (
          <ul>
            {steps.selectPages.selected.map((s) => (
              <li key={s.pageNo} data-testid="meta-run-select-page">Page {s.pageNo} · {s.tier} · {s.reason}</li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="meta-run-elevation-regions">
        <h3>Elevation regions</h3>
        {steps.elevationRegions.length === 0 ? (
          <p className="ops2-absent">None.</p>
        ) : (
          <ul>
            {steps.elevationRegions.map((r) => (
              <li key={r.pageNo} data-testid="meta-run-elevation-region">Page {r.pageNo} · {r.labels.join(", ")}</li>
            ))}
          </ul>
        )}
      </section>

      <dl data-testid="meta-run-steps">
        <div><dt>Crops rendered</dt><dd>{steps.renderCrop.pagesRendered} pages, {steps.renderCrop.cropsMade} crops</dd></div>
        <div><dt>Read attempted</dt><dd>{steps.read.attempted}</dd></div>
        <div><dt>Read returned</dt><dd>{steps.read.returned}</dd></div>
        <div><dt>Read declined</dt><dd>{steps.read.declined}</dd></div>
        <div><dt>Retried with threshold</dt><dd>{steps.read.retriedWithThreshold}</dd></div>
        <div><dt>Placements from text</dt><dd>{steps.placements.fromText}</dd></div>
        <div><dt>Placements from model fallback</dt><dd>{steps.placements.fromModelFallback}</dd></div>
        <div><dt>Unplaced</dt><dd>{steps.placements.unplaced}</dd></div>
        <div><dt>North assumed</dt><dd>{steps.northAssumed ? "yes" : "no"}</dd></div>
        <div><dt>Failed phase</dt><dd data-testid="meta-run-failed-phase">{run.document.failedPhase ?? "none"}</dd></div>
        <div><dt>Wall time</dt><dd>{run.document.wallMs != null ? `${run.document.wallMs}ms` : "not recorded"}</dd></div>
        <div><dt>Model calls</dt><dd>{run.document.modelCalls ?? "not recorded"}</dd></div>
      </dl>
    </div>
  );
}
