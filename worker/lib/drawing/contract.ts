// Plan-parse container wire contract + the reading/report types (design
// 02-design-v2.md §3.1, §3.6, §6.1). Worker-internal: after the ops descope
// (§6) no `src/` code reads any of this — see the file's own note at
// `src/data/drawingReading.ts` (never created; kept here instead).

// ── Caps — enforced Worker-side BEFORE any container call (AB-6); the
// container re-enforces the same numbers in `steps.py` as defence in depth. ──
export const MAX_PDF_BYTES = 40 * 1024 * 1024;
export const MAX_PAGES = 60;
export const MAX_CROPS_PER_PAGE = 12;
export const MAX_DPI = 300;

export type DrawingProgressPhase =
  | "inventory"
  | "elevation_inventory"
  | "floorplan_location"
  | "orientation"
  | "render_crops"
  | "opening_read";

export type ContainerFailureCode = "too_large" | "too_many_pages" | "bad_request" | "not_a_pdf" | "render_failed" | "timeout";

export interface PageInventory {
  pageNo: number;
  widthPt: number;
  heightPt: number;
  rotation: number;
  textChars: number;
  imageCount: number;
  imageAreaFraction: number;
}

export interface Inventory {
  pageCount: number;
  producer: string | null;
  fonts: string[];
  hasAttachments: boolean;
  pages: PageInventory[];
}

export interface PageWord {
  text: string;
  x0: number;
  top: number;
  x1: number;
  bottom: number;
}

export interface PageText {
  pageNo: number;
  text: string;
  words: PageWord[];
}

export interface InspectResponse {
  inventory: Inventory;
  pages: PageText[];
  timings?: { inventoryMs: number; textMs: number; wordsMs: number; totalMs: number };
}

/** [x0, y0, x1, y1] in PDF points. */
export type CropBoxPt = [number, number, number, number];

export interface RenderRequest {
  pageNo: number;
  dpi: number;
  crops?: CropBoxPt[];
  threshold?: number;
}

export interface DarknessProfile {
  /** Interior line positions as fractions of the crop, excluding its frame. */
  mullionXs: number[];
  transomYs: number[];
}

export interface RenderedImage {
  pngB64: string;
  widthPx: number;
  heightPx: number;
  profile?: DarknessProfile;
}

export interface RenderResponse {
  images: RenderedImage[];
  dpi: number;
}

// ── The three facts a reading can hold, and the state that governs each one.
// Four separate `*_state` columns (migration 0060) rather than one shared
// flag: AC-2/AC-3 make "not stated on the drawings" and "not read by us"
// distinct per field, and a schema that can only express one collapses them
// by construction, not merely by discipline. ──
export type ReadingState = "value" | "not_stated" | "not_read";

export type GapCode =
  | "unplaced"
  | "frame_ambiguous"
  | "division_unreadable"
  | "scanned"
  | "refused_contract"
  | "model_declined"
  | "render_failed"
  | "timeout";

export type SplitAxis = "vertical" | "horizontal";
export type SplitRole = "operable" | "passive";
export type OpeningOperation = "fixed" | "awning" | "casement" | "sliding" | "louvre" | "hinged" | "sidelight";

export interface SplitUnit {
  role: SplitRole;
  ratio: number;
  operation?: OpeningOperation;
  /** Arithmetic from crop ratio × schedule width; never presented as a printed dimension. */
  derivedWidthMm?: number;
}

export interface SplitReading {
  units: SplitUnit[];
  axis: SplitAxis;
}

export type Orientation = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type DrawingConfidence = "high" | "low";
export type DrawingFlag =
  | "scheduleDrawingMismatch"
  | "manufacturability"
  | "notVisibleOnElevations"
  | "northAssumed"
  | "agentEvidenceWeak"
  | "duplicateFrame"
  | "drawingInconsistency";

/** One `drawing_reading` row (migration 0060) — the release-gate and
 *  method-report unit; no `src/` reader exists after the ops descope. */
export interface DrawingReading {
  id: string;
  projectId: string;
  aiRunId: string;
  sourceFileId: string | null;
  externalRef: string;
  splitState: ReadingState;
  split: SplitReading | null;
  orientationState: ReadingState;
  orientation: Orientation | null;
  elevationState: ReadingState;
  elevation: string | null;
  roomState: ReadingState;
  roomLabel: string | null;
  gapCode: GapCode | null;
  gapNote: string | null;
  cropKey: string | null;
  pageNo: number | null;
  sheetRef: string | null;
  regionJson: [number, number, number, number] | null;
  confidence: DrawingConfidence | null;
  flags: DrawingFlag[];
}

export interface DrawingRunStepCounts {
  inventory: { pages: number; fonts: number; images: number; attachments: number };
  strategy: "text_vector" | "text_raster" | "scanned";
  text: { pagesRead: number };
  selectPages: { selected: { pageNo: number; tier: string; reason: string }[]; of: number };
  elevationRegions: { pageNo: number; labels: string[] }[];
  renderCrop: { pagesRendered: number; cropsMade: number };
  read: { attempted: number; returned: number; declined: number; retriedWithThreshold: number; targetedReviews: number };
  placements: { fromText: number; fromModelFallback: number; unplaced: number };
  northAssumed: boolean;
  failedPhase?: string;
}

export interface DrawingFileReport {
  fileId: string;
  sourceFileIds?: string[];
  steps: DrawingRunStepCounts;
  perOpening: {
    tag: string;
    outcome: "read" | "not_read";
    cropKey: string | null;
    pageNo: number | null;
    confidence?: DrawingConfidence | null;
    flags?: DrawingFlag[];
    attempts?: number;
    acceptedTurn?: number | null;
    corrections?: {
      turn: number;
      reasons: string[];
      stage?: "main" | "escalation";
      outcome?: "rejected" | "replaced" | "kept" | "failed";
    }[];
  }[];
  wallMs: number;
  modelCalls: number;
  cachedTurns?: number;
  repairedTurns?: number;
  inputTokens?: number;
  outputTokens?: number;
  containerCalls: number;
  inspectTimings?: { inventoryMs: number; textMs: number; wordsMs: number; totalMs: number };
}

/** Persisted to `ai_runs.drawing_report_json` (AC-11…AC-14, AC-24) — no
 *  filenames, no drawing text, no model output (AB-8): identifiers and
 *  counts only. */
export interface DrawingReport {
  files: DrawingFileReport[];
}
