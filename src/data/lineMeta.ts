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
  read: { attempted: number; returned: number; declined: number; retriedWithThreshold: number };
  placements: { fromText: number; fromModelFallback: number; unplaced: number };
  northAssumed: boolean;
}

export interface MetaRunDocument {
  fileId: string;
  steps: MetaRunSteps;
  failedPhase: string | null;
  wallMs: number | null;
  modelCalls: number | null;
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
  reading: MetaReading | null;   // null = no reading, INCLUDING a declined row
  run: {
    startedAt: string;                    // ai_runs.started_at
    outcome: "read" | "not_read" | null;  // this opening in perOpening (AC-17)
    document: MetaRunDocument | null;     // the ONE source document (AC-18)
  } | null;                  // null = no drawing run ever reported
}
