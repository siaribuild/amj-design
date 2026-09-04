// The READ side of ops2's Metadata tab (design
// docs/runs/ops2-parse-metadata/02-design.md §3.1). Types only — the worker
// builds the object with explicit allow-list assignments, never a spread of
// a stored row, so a field forbidden by this shape cannot leave the building.
//
// Zero runtime imports (design §3.1): nothing here executes.

export type MetaFactState = "value" | "not_stated" | "not_read";

export interface MetaFact { state: MetaFactState; value: string | null }

export interface MetaSplitUnit {
  role: string; ratio: number;
  operation: string | null; derivedWidthMm: number | null;
}

export interface MetaReading {
  heading: MetaFact;          // orientation_state / orientation
  elevation: MetaFact;
  room: MetaFact;
  split: { state: MetaFactState; axis: string | null; units: MetaSplitUnit[] };
  confidence: "high" | "low" | null;   // rendered verbatim (spec assumption)
  flags: string[];                      // full list, max 7 at source (AC-16)
                             // lives in one place, the DTO builder, not the skin
  source: {
    fileId: string | null;
    filename: string | null; // LEFT JOIN file_asset; null if file deleted
    pageNo: number | null;
    sheetRef: string | null;
    region: string | null;   // compact "x,y,w,h" built from region_json numbers
  };
}

/** Allow-listed copy of a run's per-file step counts (`DrawingRunStepCounts`,
 *  worker/lib/drawing/contract.ts) — `failedPhase` is hoisted to
 *  `MetaRunDocument.failedPhase` rather than duplicated inside. */
export interface MetaRunSteps {
  inventory: { pages: number; fonts: number; images: number; attachments: number };
  strategy: "text_vector" | "text_raster" | "scanned";
  text: { pagesRead: number };
  selectPages: { selected: { pageNo: number; tier: string; reason: string }[]; of: number };
  elevationRegions: { pageNo: number; labels: string[] }[];
  renderCrop: { pagesRendered: number; cropsMade: number };
  read: { attempted: number; returned: number; declined: number; retriedWithThreshold: number; targetedReviews: number | null };
  placements: { fromText: number; fromModelFallback: number; unplaced: number };
  northAssumed: boolean;
}

/** One correction the agent's own rails forced on it. TWO SHAPES AT SOURCE,
 *  normalised here to four keys so the client never branches on a missing one:
 *
 *    main rejection   `{ turn, reasons }`                    - no stage, no outcome
 *    escalation       `{ turn: 1, stage, outcome, reasons }`  - turn is ALWAYS 1
 *
 *  `stage`/`outcome` are null on a main rejection because the parser writes
 *  none there, not because they were dropped. Reasons are raw codes
 *  (`identity_tag_not_on_plan_page`), never prose — the same rule the state
 *  words follow. */
export interface MetaCorrection {
  turn: number;
  reasons: string[];
  stage: string | null;
  outcome: string | null;
}

/** What the run cost and whether the machine itself broke — Run door, bottom.
 *  `providerFailure` is separate from a gap code on purpose: a model call that
 *  failed and a drawing nothing could be read from need different people. */
export interface MetaRunTelemetry {
  cachedTurns: number | null;
  repairedTurns: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface MetaRunDocument {
  fileId: string;
  steps: MetaRunSteps;
  failedPhase: string | null;
  wallMs: number | null;
  modelCalls: number | null;
  telemetry: MetaRunTelemetry;
  providerFailure: { failureKind: string | null; warnings: string[] } | null;
}

export interface LineMetaDto {
  hasCrop: boolean;          // the crop KEY never leaves the worker (AC-26/30)
  // WHY there is no crop, at the top level and not only inside `reading` —
  // because the case that most needs it is the one where `reading` is null: a
  // declined opening persists a row whose facts are all `not_read`, and the
  // Image panel must still name the recorded reason (AC-10) on a tab whose
  // Reading panel correctly says no reading exists (AC-7).
  gapCode: string | null;
  // The parser's own words, gap_note split on "|" SERVER-side (AC-15). Beside
  // gapCode and NOT inside `reading` for the same reason: a declined opening
  // has no reading to carry it, and a decline is exactly when the reason is
  // worth reading. The code says WHAT stopped it; this says why.
  reasoningParts: string[];
  // THE AGENT CORRECTING ITSELF. Top-level, not inside `reading`, because a
  // declined opening has no reading and its trail is the most interesting one
  // on the tab. `attempts`/`acceptedTurn` are null when the report predates
  // 19-of-19 and carries neither — ABSENT is unknown, never 0, because the
  // parser writes a real 0 for an opening it touched.
  attempts: number | null;
  acceptedTurn: number | null;
  corrections: MetaCorrection[];   // [] = read first time; absence IS the signal
  reading: MetaReading | null;   // null = no reading, INCLUDING a declined row
  run: {
    startedAt: string;                    // ai_runs.started_at
    outcome: "read" | "not_read" | null;  // this opening in perOpening (AC-17)
    // Whether the run produced a report AT ALL. The last run is the last run,
    // failed ones included, so a run with no report is shown rather than
    // reached past - but "no report" and "a report that does not name this
    // opening" are different facts and must not share a sentence.
    reported: boolean;
    document: MetaRunDocument | null;     // the ONE source document (AC-18)
  } | null;                  // null = no drawing run ever reported
}
