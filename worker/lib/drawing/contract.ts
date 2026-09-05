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
/** The most the container may answer with, per call, for the modes that were
 * here before the face-mapped engine: unchanged for them. A render holds what
 * they ask for - twelve crops in one response, a page at 300 DPI. Past a cap is
 * a render gone wrong, never held to find out. */
export const MAX_INSPECT_RESPONSE_BYTES = 16 * 1024 * 1024;
export const MAX_RENDER_RESPONSE_BYTES = 16 * 1024 * 1024;

// ── The face-mapped engine's memory, as one arithmetic per run (§8). The
// isolate is 128 MB. With its renders one at a time (pool.ts `serial`), a run
// holds: the PDF for the file's whole life; one framed copy of it in flight
// (the container reads its request by Content-Length, so the copy stays) with
// the response bytes and the string they decode to; the inspection kept for
// the file's life, parsed; the crops Phase E keeps between renders; and the
// runtime. 20 + (20 + 8) + 16 + 32 + 24 = 120 < 128, and the inspection alone,
// before anything else exists, 20 + (20 + 16) + 24 = 80. The bound is the
// run's own concurrency; no ledger outlives the request, and two runs in one
// isolate are the platform's scheduling to bound, not this engine's. Only this
// engine's calls carry these caps: the other modes' memory is as it was. ──
export const WORKER_ISOLATE_BYTES = 128 * 1024 * 1024;
/** The largest PDF this engine reads: the size at which the arithmetic
 * closes. The reference sets are 2-6 MB. The other modes keep MAX_PDF_BYTES. */
export const FACE_MAPPED_MAX_PDF_BYTES = 20 * 1024 * 1024;
/** Measured on the reference sets: an inspection is 54-64 KB of payload per
 * page, about 4 MB at the 60-page cap; a full sheet at 150 DPI is 2.03 MB of
 * base64 and a 300 DPI crop far less. Each cap is twice what it bounds. */
export const FACE_MAPPED_INSPECT_RESPONSE_BYTES = 8 * 1024 * 1024;
export const FACE_MAPPED_RENDER_RESPONSE_BYTES = 4 * 1024 * 1024;
/** The inspection is kept for the file's life, parsed: word objects take up to
 * 1.84x their wire size on the reference sets (measured), priced at 2x. */
export const RETAINED_INSPECTION_BYTES = 2 * FACE_MAPPED_INSPECT_RESPONSE_BYTES;
/** Phase E reads crops in waves: this many per batch, this many batches in
 * flight (§7.6), and so this many crops of at most MAX_CROP_BASE64 kept. */
export const COMPOSITION_BATCH_SIZE = 4;
export const COMPOSITION_CONCURRENT_BATCHES = 4;
export const MAX_CROP_BASE64 = 2_000_000;
export const MAX_RETAINED_CROP_BYTES = COMPOSITION_BATCH_SIZE * COMPOSITION_CONCURRENT_BATCHES * MAX_CROP_BASE64;

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
  /** Migration 0064, face-mapped engine only: which number along its wall this
   *  opening is, and which frame on the elevation it was read from. */
  wallOrder?: number | null;
  frameBoxPt?: CropBoxPt | null;
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

/** The phase that lost an opening, in the handover's words (§12). */
export type FailurePhase = "plan" | "frame_inventory" | "matching" | "crop" | "composition";

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
    /** Face-mapped engine lineage: the plan candidate an opening was placed
     *  from, the frame it was read from, which way the wall was read, where the
     *  page's scale came from, and how the crop was sized. */
    planCandidateId?: string | null;
    frameId?: string | null;
    direction?: "with_plan" | "against_plan" | null;
    scaleSource?: "printed" | "recovered" | "calibrated" | null;
    cropBasis?: "scaled" | "calibrated" | "wider_frame" | "wide_unscaled" | null;
    /** The face the opening was looked for on, the scale its widths were sized
     *  by, a note where that scale contradicts the sheet, and where and why it
     *  was lost - so an audit of one opening does not start from the log. */
    faceKey?: string | null;
    scaleRatio?: number | null;
    scaleNote?: string | null;
    failurePhase?: FailurePhase | null;
    gapCode?: GapCode | null;
    gapNote?: string | null;
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
  providerFailure?: { failureKind: string | null; warnings: string[] };
  containerCalls: number;
  inspectTimings?: { inventoryMs: number; textMs: number; wordsMs: number; totalMs: number };
}

/** Persisted to `ai_runs.drawing_report_json` (AC-11…AC-14, AC-24) — no
 *  filenames, drawing text or model output (AB-8); bounded provider diagnostics
 *  remain available to staff. */
export interface DrawingReport {
  files: DrawingFileReport[];
}
